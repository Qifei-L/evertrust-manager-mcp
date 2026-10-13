FROM node:24-bookworm-slim
WORKDIR /app
COPY package.json ./
COPY scripts ./scripts
COPY worker ./worker
COPY skills ./skills
COPY .openai ./.openai
COPY server ./server
RUN node scripts/build.mjs && node scripts/validate-artifact.mjs
ENV NODE_ENV=production DATA_DIR=/data
EXPOSE 3000
CMD ["node", "server/index.mjs"]
