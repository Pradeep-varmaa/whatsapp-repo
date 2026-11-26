import dotenv from "dotenv";
dotenv.config();

export const workerConfig = {
  redisHost: process.env.REDIS_HOST || "localhost",
  redisPort: parseInt(process.env.REDIS_PORT || "6379", 10),
  redisPassword: process.env.REDIS_PASSWORD || undefined,
  concurrency: 10,
  maxRetries: 5,
};
