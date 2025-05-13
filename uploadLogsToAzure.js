require('dotenv').config();
const { BlobServiceClient } = require('@azure/storage-blob');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const moment = require('moment');

const containerName = process.env.AZURE_CONTAINER_NAME;
const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
const logsDir = path.join(__dirname, 'logs');

// Upload a single log file to the appropriate folder (dev, stage, prod)
const uploadLogFile = async (filePath, fileName) => {
  try {
    const envPrefix = fileName.split('_')[0]; // e.g., "dev" from "dev_log_13_05_2025.txt"
    const blobPath = `${envPrefix}/${fileName}`; // dev/dev_log_13_05_2025.txt
    
    const containerClient = blobServiceClient.getContainerClient(containerName);
    await containerClient.createIfNotExists();
    
    const blobClient = containerClient.getBlockBlobClient(blobPath);
    const stream = fs.createReadStream(filePath);
    await blobClient.uploadStream(stream);
    
    console.log(`Uploaded: ${blobPath}`);
  } catch (err) {
    console.error(`Upload failed for ${fileName}:`, err.message);
  }
};

// Upload all logs from the previous day
const uploadPreviousDayLogs = async () => {
  const yesterday = moment().subtract(1, 'day').format('DD_MM_YYYY');
  const files = fs.readdirSync(logsDir).filter(f => f.includes(yesterday));
  
  if (files.length === 0) {
    console.log(`No logs found for ${yesterday}`);
    return;
  }
  
  for (const file of files) {
    const filePath = path.join(logsDir, file);
    await uploadLogFile(filePath, file);
  }
};

// Schedule the upload to run daily at 1 AM
cron.schedule('0 1 * * *', () => {
  console.log('Running scheduled log upload job at 1 AM...');
  uploadPreviousDayLogs();
});
