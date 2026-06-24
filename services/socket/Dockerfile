FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=80

WORKDIR /app/services/socket

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

EXPOSE 80

CMD ["npm", "start"]
