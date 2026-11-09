import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { hash } from '@node-rs/bcrypt';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Script is at: backend/src/utils/seedDevUsers.js
// .env is at:   backend/.env
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import User from '../models/User.js';

const BCRYPT_COST = Number(process.env.BCRYPT_COST) || 10;

async function seedDevUsers() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌ MONGODB_URI is not defined.');
    console.error('   Looked for .env at:', path.resolve(__dirname, '../../.env'));
    console.error('   Make sure backend/.env exists and contains MONGODB_URI=...');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log('✅ Connected to MongoDB');

    const hashedPassword = await hash('Password123!', BCRYPT_COST);

    const devUsers = [
      {
        name: 'Faculty Member',
        email: 'teacher@spandan.edu',
        password: hashedPassword,
        role: 'teacher',
        teacherApprovalStatus: 'approved',
        isAdmin: true,
        authProvider: 'local',
      },
      {
        name: 'Student Member',
        email: 'student@spandan.edu',
        password: hashedPassword,
        role: 'student',
        teacherApprovalStatus: 'approved',
        isAdmin: false,
        authProvider: 'local',
      },
      {
        name: 'Student One',
        email: 'student1@spandan.edu',
        password: hashedPassword,
        role: 'student',
        teacherApprovalStatus: 'approved',
        isAdmin: false,
        authProvider: 'local',
      },
      {
        name: 'Student Two',
        email: 'student2@spandan.edu',
        password: hashedPassword,
        role: 'student',
        teacherApprovalStatus: 'approved',
        isAdmin: false,
        authProvider: 'local',
      },
      {
        name: 'Student Three',
        email: 'student3@spandan.edu',
        password: hashedPassword,
        role: 'student',
        teacherApprovalStatus: 'approved',
        isAdmin: false,
        authProvider: 'local',
      },
    ];

    for (const userData of devUsers) {
      await User.findOneAndUpdate(
        { email: userData.email }, // Matches uniquely by email to prevent duplicates
        { $set: userData },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    console.log('🎉 Seeded teacher, student, student1, student2, and student3 cleanly (no duplicates).');
    console.log('   Password for all accounts: Password123!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  }
}

seedDevUsers();