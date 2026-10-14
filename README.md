# CyberCTF - Multiplayer Capture The Flag Platform

CyberCTF is a full-stack platform for conducting Capture The Flag (CTF) cybersecurity competitions. Participants join events using a game PIN, solve categorized challenges, submit flags, and track progress through a real-time leaderboard. The platform is built for academic use and can be extended for larger deployments.

## Overview

| Category | Details |
|---|---|
| Project Type | Full-stack web application |
| Primary Use Case | Multiplayer CTF event management and participation |
| Users | Players and administrators |
| Deployment Model | Cloud-hosted frontend, backend, and database |

## Core Features

- Event participation using game PIN
- Challenge organization by category and difficulty
- Secure flag validation with hashed flag storage
- Real-time leaderboard and ranking visibility
- Hint unlock system with score deduction
- Admin console for events, users, and challenges
- Cloud media handling for PDFs and challenge resources

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React (Vite), Tailwind CSS |
| Backend | Node.js, Express |
| Database | MongoDB, Mongoose |
| Authentication | JWT |
| API Client | Axios |
| Media Storage | Cloudinary |
| Deployment | Vercel (Frontend), Render (Backend), MongoDB Atlas |

## System Architecture

CyberCTF follows a client-server architecture. The frontend consumes REST APIs exposed by the backend for authentication, event participation, challenge management, submissions, and leaderboard updates. MongoDB stores platform data, while Cloudinary serves externally hosted challenge files and assets.

### Request Flow

```text
Player/Admin (React UI)
	|
	v
Express REST API (Auth, Events, Challenges, Leaderboard)
	|
	+--> MongoDB Atlas (users, events, challenges, submissions, hints)
	|
	+--> Cloudinary (PDFs, challenge resources)
```

## API Structure

High-level endpoint groups:

- `POST /api/auth/*` - login, join, token/session workflows
- `GET|POST|PUT|DELETE /api/challenges/*` - challenge CRUD and flag submission
- `GET /api/leaderboard/*` - rankings and leaderboard progression
- `GET|POST|PUT|DELETE /api/admin/*` - administrative operations
- `GET|POST /api/categories/*` - category retrieval and management

## Installation and Local Setup

### 1. Clone Repository

```bash
git clone <your-repository-url>
cd CyberCTF
```

### 2. Install Dependencies

```bash
cd backend
npm install

cd ../frontend
npm install
```

### 3. Configure Environment

Create these files:

- `backend/.env`
- `frontend/.env`

Populate them using the variables below.

### 4. Run Application

Terminal 1 (backend):

```bash
cd backend
npm start
```

Terminal 2 (frontend):

```bash
cd frontend
npm run dev
```

## Environment Variables

### Backend (`backend/.env`)

```env
PORT=5000
NODE_ENV=development
MONGO_URI=<your-mongodb-uri>
JWT_SECRET=<your-jwt-secret>
CLOUDINARY_CLOUD_NAME=<your-cloudinary-cloud-name>
CLOUDINARY_API_KEY=<your-cloudinary-api-key>
CLOUDINARY_API_SECRET=<your-cloudinary-api-secret>
CORS_ORIGIN=http://localhost:5173
```

Challenge attachments are uploaded through the authenticated backend. Set the three Cloudinary variables on the backend deployment; do not expose the API secret through frontend `VITE_` variables.

### Frontend (`frontend/.env`)

```env
VITE_API_URL=http://localhost:5000/api
```

## Future Improvements

- Add caching for leaderboard, challenge metadata, and frequent read endpoints to improve performance at scale.
- Introduce stronger traffic controls and monitoring for larger concurrent events.

## Limitations

The current implementation is optimized for small to medium academic events and may require infrastructure scaling and caching for very large concurrency.

## Team Contact

| # | Name | Role | Email |
|---|---|---|---|
| 1 | Arfat Kadvekar | Developer | [arfatkadvekar1305@gmail.com](mailto:arfatkadvekar1305@gmail.com) |
| 2 | Obaidullah Shaikh | Developer | [shkobaid88@gmail.com](mailto:shkobaid88@gmail.com) |
| 3 | Omair Potrick | Developer | [omairpotrick@gmail.com](mailto:omairpotrick@gmail.com) |
| 4 | Aditi Raje | Developer | [aditiraje006@gmail.com](mailto:aditiraje006@gmail.com) |
| 5 | Soham Metha | Developer | [sohammetha01@gmail.com](mailto:sohammetha01@gmail.com) |
