# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY pm_solution_fe/package*.json /app/
RUN npm ci
COPY pm_solution_fe/ /app/
# VITE_API_BASE_URL can be passed at build time (default empty for same-origin)
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

# Runtime stage
FROM nginx:alpine
COPY --from=build /app/dist/ /usr/share/nginx/html/
COPY pm_solution_fe/docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

