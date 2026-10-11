import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { User, Event, Category, Challenge } from './models/index.js';
import { connectDB } from './utils/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });
if (!process.env.MONGODB_URI && !process.env.MONGO_URI) {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
}

async function seed() {
  try {
    console.log('Connecting to database...');
    await connectDB();

    console.log('Checking for existing admin...');
    const existingAdmin = await User.findOne({ role: 'admin' });

    if (!existingAdmin) {
      const adminUsername = process.env.ADMIN_USERNAME || 'admin';
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@ctf.local';
      const adminPassword = process.env.ADMIN_PASSWORD || 'AdminPassword123!';

      console.log(`Creating default admin (${adminUsername})...`);
      await User.create({
        username: adminUsername,
        email: adminEmail,
        password: adminPassword,
        role: 'admin'
      });
      console.log('Default admin created successfully.');
      console.log(`Username: ${adminUsername}`);
      console.log(`Password: ${adminPassword}`);
    } else {
      console.log(`Admin account already exists: ${existingAdmin.username} (${existingAdmin.email})`);
    }

    console.log('Database seed check completed.');
    process.exit(0);
  } catch (err) {
    console.error('Seed script error:', err);
    process.exit(1);
  }
}

seed();
