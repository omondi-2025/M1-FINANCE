# M1 Finance Web App

A full-stack finance and investment web app built with **Node.js**, **Express**, **MongoDB**, and **vanilla HTML/CSS/JavaScript**.

## Features

- User signup, signin, and JWT authentication
- One-time **KES 100 welcome bonus**
- Manual **M-Pesa recharge** request flow with duplicate transaction protection
- **Withdrawal** requests with automatic **10% service fee** calculation
- Package investment earnings reflection
- **Wealth Fund** investments:
  - South Africa Oil
  - Petrol in Nigeria
  - Crypto Trading
- Earnings processor running **every minute** to reflect due earnings
- Referral rewards after successful investment
- Admin dashboard for:
  - approving/rejecting recharges
  - approving/rejecting withdrawals
  - posting company notifications
- Email notifications for approvals, rejections, and earnings
- Forgot-password and password reset flow
- Financial statement and support pages
- PWA install support so users can add the app to Android/iPhone home screens

---

## Tech Stack

- **Backend:** Node.js, Express
- **Database:** MongoDB + Mongoose
- **Auth:** JWT, bcryptjs
- **Email:** Nodemailer
- **Scheduler:** node-cron
- **Frontend:** HTML, CSS, JavaScript

---

## Project Structure

```text
M1/
├── server.js
├── package.json
├── controllers/
├── middleware/
├── models/
├── public/
│   ├── index.html
│   ├── profile.html
│   ├── wealthfund.html
│   ├── recharge.html
│   ├── withdrawal.html
│   ├── history.html
│   ├── admin.html
│   ├── manifest.json
│   ├── sw.js
│   ├── css/
│   ├── js/
│   └── images/
├── routes/
└── utils/
```

---

## Requirements

Before running the project, make sure you have:

- **Node.js** 18+ recommended
- **npm**
- **MongoDB** connection string

---

## Installation

### 1. Clone or open the project

```bash
cd M1
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create a `.env` file

Add the following values:

```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_secret
EMAIL_USER=your_email@example.com
EMAIL_PASS=your_email_app_password
ADMIN_USERNAME=your_admin_username
ADMIN_PASSWORD=your_admin_password
```

> Use your own secure values. Do not commit real credentials.

### 4. Start the server

```bash
npm start
```

For development:

```bash
npm run dev
```

---

## Running the App

Once started, open:

```text
http://localhost:5000
```

Useful pages:

- `http://localhost:5000/index.html` — Dashboard
- `http://localhost:5000/profile.html` — Profile
- `http://localhost:5000/wealthfund.html` — Wealth Fund
- `http://localhost:5000/recharge.html` — Recharge
- `http://localhost:5000/withdrawal.html` — Withdrawal
- `http://localhost:5000/history.html` — History
- `http://localhost:5000/admin.html` — Admin panel

---

## Earnings Scheduler

The app includes an automated cron job in `server.js` that runs **every minute**:

- checks active package investments
- reflects due earnings to user balances
- processes matured wealth funds
- logs credited earnings

This ensures earnings reflection remains active and effective while the server is running.

---

## PWA / Download App Support

Users can install the app to their phone home screen from the **Profile** page.

- **Android:** tap `Download App` and install
- **iPhone/iPad:** use **Share → Add to Home Screen**

---

## Main API Areas

- `/api/auth` — signup, signin, password reset
- `/api/user` — profile, dashboard, notifications, statement, support
- `/api/invest` — package investment actions
- `/api/recharge` — recharge submission and validation
- `/api/user/withdraw` — withdrawal actions
- `/api/wealthfund` — wealth fund plans, invest, history
- `/api/admin` — admin login, approvals, notifications

---

## Notes

- Keep MongoDB and the Node server running for full functionality.
- Email features require valid SMTP/Gmail credentials.
- This project uses static frontend pages served from `public/`.

---

## License

This project is for private/project use unless you choose to add your own license.
