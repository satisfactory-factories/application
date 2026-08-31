import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { JwtModule } from '@nestjs/jwt'
import { MongooseModule } from '@nestjs/mongoose'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import type { Connection } from 'mongoose'

import { AuthModule } from './auth/auth.module'
import { VersionGateGuard } from './common/guards/version-gate.guard'
import { validateEnv } from './config/env'
import { THROTTLER_OPTIONS } from './config/throttling'
import { HealthModule } from './health/health.module'
import { LegacyModule } from './legacy/legacy.module'
import { PreferencesModule } from './preferences/preferences.module'
import { RealtimeModule } from './realtime/realtime.module'
import { RoomsModule } from './rooms/rooms.module'
import { VersionModule } from './version/version.module'

@Module({
  imports: [
    // Under vitest the .env file must not win over process.env: the test apps
    // inject the in-memory mongod's URI through process.env, and the committed
    // backend/.env would silently redirect every suite to a real localhost Mongo.
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      validate: validateEnv,
      ignoreEnvFile: Boolean(process.env.VITEST),
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { algorithm: 'HS256', expiresIn: '30d' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        uri: config.getOrThrow<string>('MONGODB_URI'),
        bufferCommands: true,
        autoIndex: true,
        autoCreate: true,
        // Boot must not block on Mongo: /health's whole job is to answer 503
        // when the database is down, which it cannot do if the app never starts.
        lazyConnection: true,
        connectionFactory: (connection: Connection) => {
          connection.on('connected', () => console.log('Connected to MongoDB'))
          connection.on('error', error => console.log('Error connecting to MongoDB', error))
          return connection
        },
      }),
    }),
    ThrottlerModule.forRoot(THROTTLER_OPTIONS),
    HealthModule,
    VersionModule,
    AuthModule,
    LegacyModule,
    RoomsModule,
    RealtimeModule,
    PreferencesModule,
  ],
  providers: [
    // Order matters: rate limiting ran as the first express middleware, ahead of
    // everything the version gate can reject.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: VersionGateGuard },
  ],
})
export class AppModule {}
