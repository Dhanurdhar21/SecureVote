# SecureVote 🗳️

SecureVote is a modern, secure, and user-friendly election management and voting platform built with React, Vite, and Supabase. It provides administrators with a powerful dashboard to create and manage elections, while offering voters a seamless, secure experience to cast their ballots.

## 🚀 Features

- **Admin Portal**: 
  - Create and manage elections (Title, Description, Dates).
  - Add and manage candidates (Upload photos, descriptions).
  - Real-time voting analytics and statistics dashboard.
  - Secure authentication with Google OAuth or Email/Password.
  - Account linking prevents duplicate admin accounts.
- **Voter Portal**: 
  - Secure login system (Email/OTP or Social Logins).
  - Clean, intuitive wizard interface for casting votes.
  - Real-time fraud detection and duplicate-vote prevention.
- **Architecture**:
  - Row Level Security (RLS) ensures votes are completely private and tamper-proof.
  - Unified Identity Model handles seamless account merging.

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Tailwind CSS, Framer Motion (Animations), Lucide React (Icons)
- **Backend & Database**: Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **Routing**: React Router DOM

## 📦 Getting Started

### Prerequisites
Make sure you have [Node.js](https://nodejs.org/) installed on your machine.

### 1. Clone the repository
```bash
https://github.com/Dhanurdhar21/SecureVote.git
```

### 2. Install dependencies
```bash
npm install
```

### 3. Environment Variables
Create a `.env` file in the root directory and add your Supabase credentials:
```env
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. Run the development server
```bash
npm run dev
```
The application will open in your browser at `http://localhost:5173`.

## 🗄️ Database Setup

To set up the Supabase database, run the SQL files located in the `supabase/migrations/` folder inside your Supabase SQL Editor in the following order:

1. Initial Schema
2. Voter Management & Wallets
3. Storage Policies (Creates `candidate-photos` bucket)
4. Fraud Detection
5. Account Linking

## 📄 License
This project is licensed under the MIT License.
