FROM node:20-alpine

WORKDIR /app
COPY services/backend/package*.json ./
RUN npm install --omit=dev

COPY services/backend ./services/backend

WORKDIR /app/services/backend
ENV PORT=8080
ENV DATABASE_DRIVER=mongodb
EXPOSE 8080
CMD ["npm", "start"]
