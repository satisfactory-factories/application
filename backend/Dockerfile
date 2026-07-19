FROM node:24

# Install pnpm
RUN npm install -g pnpm

COPY . /app
WORKDIR /app

RUN pnpm install

EXPOSE 3010

CMD ["pnpm", "start"]