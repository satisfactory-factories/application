import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, UseGuards } from '@nestjs/common'
import type {
  DeleteRoomResult,
  EnsureRoomResult,
  JoinRoomResult,
  LeaveRoomResult,
  LegacyImportResult,
  RoomAuthResult,
  RoomEnvelope,
  RoomListResponse,
  RoomPasswordResult,
  RoomSlugLookup,
} from 'common'

import { AuthTokenPayload } from '../auth/auth-token'
import { CurrentUser, JwtAuthGuard } from '../auth/jwt-auth.guard'
import { LegacyImportService } from './legacy-import.service'
import { RoomsService } from './rooms.service'
import {
  adoptRoomSchema,
  authRoomSchema,
  autoImportSchema,
  createRoomSchema,
  joinRoomSchema,
  parseBody,
  parseContentBody,
  renameRoomSchema,
  reorderSchema,
  setPasswordSchema,
  shareRoomSchema,
} from './rooms.dto'

/**
 * Specific paths are declared before parameterised ones so `/rooms/adopt` and
 * `/rooms/legacy/...` can never be read as a room id.
 */
@Controller('rooms')
export class RoomsController {
  constructor (
    private readonly rooms: RoomsService,
    private readonly legacy: LegacyImportService,
  ) {}

  @Get()
  @UseGuards(JwtAuthGuard)
  list (@CurrentUser() user: AuthTokenPayload): Promise<RoomListResponse> {
    return this.rooms.listRooms(user.id)
  }

  @Get('by-slug/:slug')
  bySlug (@Param('slug') slug: string): Promise<RoomSlugLookup> {
    return this.rooms.lookupBySlug(slug.toLowerCase())
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create (
    @CurrentUser() user: AuthTokenPayload,
    @Body() body: unknown,
  ): Promise<EnsureRoomResult> {
    return this.rooms.ensureRoom(user.id, parseContentBody(createRoomSchema, body), 'created')
  }

  @Post('adopt')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  adopt (
    @CurrentUser() user: AuthTokenPayload,
    @Body() body: unknown,
  ): Promise<EnsureRoomResult> {
    return this.rooms.ensureRoom(user.id, parseContentBody(adoptRoomSchema, body), 'adopted')
  }

  @Post('legacy/auto-import')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  autoImport (@CurrentUser() user: AuthTokenPayload, @Body() body: unknown): Promise<LegacyImportResult> {
    const { localTabCount } = parseBody(autoImportSchema, body)
    return this.legacy.autoImport(user.id, user.username, localTabCount)
  }

  @Post('legacy/recover')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  recover (@CurrentUser() user: AuthTokenPayload): Promise<LegacyImportResult> {
    return this.legacy.recover(user.id, user.username)
  }

  @Put('order')
  @UseGuards(JwtAuthGuard)
  reorder (@CurrentUser() user: AuthTokenPayload, @Body() body: unknown): Promise<RoomListResponse> {
    return this.rooms.reorder(user.id, parseBody(reorderSchema, body).roomIds)
  }

  @Put(':roomId/name')
  @UseGuards(JwtAuthGuard)
  async rename (
    @CurrentUser() user: AuthTokenPayload,
    @Param('roomId') roomId: string,
    @Body() body: unknown,
  ): Promise<RoomEnvelope> {
    const { name } = parseContentBody(renameRoomSchema, body)
    return { room: await this.rooms.rename(user.id, roomId, name) }
  }

  @Post(':roomId/share')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async share (
    @CurrentUser() user: AuthTokenPayload,
    @Param('roomId') roomId: string,
    @Body() body: unknown,
  ): Promise<RoomEnvelope> {
    const { slug } = parseBody(shareRoomSchema, body)
    return { room: await this.rooms.share(user.id, roomId, slug) }
  }

  @Post(':roomId/unshare')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async unshare (
    @CurrentUser() user: AuthTokenPayload,
    @Param('roomId') roomId: string,
  ): Promise<RoomEnvelope> {
    return { room: await this.rooms.unshare(user.id, roomId) }
  }

  @Put(':roomId/password')
  @UseGuards(JwtAuthGuard)
  async setPassword (
    @CurrentUser() user: AuthTokenPayload,
    @Param('roomId') roomId: string,
    @Body() body: unknown,
  ): Promise<RoomPasswordResult> {
    const { password } = parseBody(setPasswordSchema, body)
    return { passwordVersion: await this.rooms.setPassword(user.id, roomId, password) }
  }

  @Delete(':roomId/password')
  @UseGuards(JwtAuthGuard)
  async removePassword (
    @CurrentUser() user: AuthTokenPayload,
    @Param('roomId') roomId: string,
  ): Promise<RoomPasswordResult> {
    return { passwordVersion: await this.rooms.removePassword(user.id, roomId) }
  }

  // No guard: an anonymous visitor exchanges the password for a visitor token.
  @Post(':roomId/auth')
  @HttpCode(HttpStatus.OK)
  async authenticate (
    @Param('roomId') roomId: string,
    @Body() body: unknown,
  ): Promise<RoomAuthResult> {
    const { password } = parseBody(authRoomSchema, body)
    return { visitorToken: await this.rooms.authenticate(roomId, password) }
  }

  @Post(':roomId/join')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  join (
    @CurrentUser() user: AuthTokenPayload,
    @Param('roomId') roomId: string,
    @Body() body: unknown,
  ): Promise<JoinRoomResult> {
    const { visitorToken } = parseBody(joinRoomSchema, body)
    return this.rooms.join(user.id, roomId, visitorToken)
  }

  @Post(':roomId/leave')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  async leave (
    @CurrentUser() user: AuthTokenPayload,
    @Param('roomId') roomId: string,
  ): Promise<LeaveRoomResult> {
    await this.rooms.leave(user.id, roomId)
    return { status: 'left' }
  }

  @Delete(':roomId')
  @UseGuards(JwtAuthGuard)
  async remove (
    @CurrentUser() user: AuthTokenPayload,
    @Param('roomId') roomId: string,
  ): Promise<DeleteRoomResult> {
    await this.rooms.deleteRoom(user.id, roomId)
    return { status: 'deleted' }
  }
}
