# Use Node.js LTS version as base image
FROM node:18-alpine

# Set working directory inside container
WORKDIR /app

# Copy package files and install dependencies
COPY package.json ./
RUN npm install

# Copy rest of the application
COPY . .

# Create logs directory
RUN mkdir -p logs logs/dev logs/stage logs/prod

# Expose the port the app runs on
EXPOSE 8000

# Start the proxy server
CMD ["node", "proxy-server.js"]
