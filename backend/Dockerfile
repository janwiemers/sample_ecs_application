FROM node:22-alpine3.18 AS builder

RUN mkdir /app

WORKDIR /app

COPY . .

RUN npm install --quiet
RUN npm run build

FROM node:22-alpine3.18

RUN mkdir /app

WORKDIR /app

COPY --from=builder /app/src/index.js /app
COPY --from=builder /app/package.json /app
COPY --from=builder /app/package-lock.json /app
COPY --from=builder /app/tsconfig.json /app

RUN npm install --only=prod --quiet

RUN npm install pm2 -g

CMD ["pm2-runtime", "index.js"]