FROM mcr.microsoft.com/playwright:v1.61.0-noble
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --chown=pwuser:pwuser . .
RUN mkdir -p /app/runtime-data && chown -R pwuser:pwuser /app
USER pwuser
ENV PORT=8080
ENV DATA_DIR=/app/runtime-data
EXPOSE 8080
CMD ["node", "server.js"]
