FROM node:20.17

# Install pnpm
RUN npm install -g pnpm

COPY . /app
WORKDIR /app

RUN pnpm install

EXPOSE 3001

CMD ["pnpm", "start"]