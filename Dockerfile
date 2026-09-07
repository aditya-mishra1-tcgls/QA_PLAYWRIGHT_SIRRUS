FROM mcr.microsoft.com/playwright:v1.55.0-noble

WORKDIR /app

ENV QA_DASHBOARD_HOST=0.0.0.0
ENV QA_DASHBOARD_PORT=9324
ENV TEST_ENV=uat

COPY package.json package-lock.json ./

RUN npm ci

COPY . .

EXPOSE 9324

CMD ["npm", "run", "dashboard"]
