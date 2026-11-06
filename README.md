# 🔐 BlockGuard – Fake Product Detection Using Blockchain

**BlockGuard** is a QR-code-based product authentication system designed to help consumers identify potentially counterfeit products. It uses product registration, unique QR codes and a custom blockchain-inspired ledger to record product information and support verification.

The project demonstrates how blockchain concepts can be applied to product authentication and supply-chain transparency.

## 🚀 Key Features

- **Product Registration:** Manufacturers can register products with details such as product name, category, manufacturer and batch number.
- **QR Code Generation:** Generates a unique QR code for every registered product.
- **Product Verification:** Consumers can verify a product using its QR code.
- **Blockchain-Based Record Keeping:** Stores product registration records in a linked-block ledger.
- **Chain Explorer:** View recorded blocks, hashes and previous-hash relationships.
- **Verification Tracking:** Records product verification attempts and their results.
- **Analytics Dashboard:** Displays product and verification statistics.

## 🛠️ Tech Stack

| Technology | Purpose |
|---|---|
| Next.js 16 | Full-stack web framework |
| React 19 | User interface |
| TypeScript | Type-safe development |
| Tailwind CSS | Styling |
| shadcn/ui & Radix UI | UI components |
| Prisma ORM | Database operations |
| SQLite | Database |
| Node.js | Runtime environment |

## 🏗️ System Architecture

The application follows this general workflow:

1. Manufacturer enters product information.
2. The application generates a unique product QR code.
3. Product information is recorded in the database and custom blockchain ledger.
4. Consumer scans or enters the QR code.
5. The system checks whether the product is registered.
6. The verification result is displayed and recorded.

```text
       Manufacturer
             |
             v
     Product Registration
             |
             v
       QR Code Generation
             |
             v
      Product Database
             |
             v
     Custom Blockchain Ledger
             |
             v
       Consumer Verification
             |
             v
       Verification Result
```

## ⚙️ Getting Started

Follow these instructions to run BlockGuard locally.

### Prerequisites

- Node.js
- npm
- Git

### 1. Clone the repository

```bash
git clone https://github.com/YaassinMD/BlockGuard.git
```

### 2. Navigate to the project directory

```bash
cd BlockGuard
```

### 3. Install dependencies

```bash
npm install
```

### 4. Configure environment variables

Create a `.env` file in the project root and add:

```env
DATABASE_URL="file:../db/custom.db"
```

### 5. Generate Prisma Client

```bash
npx prisma generate
```

### 6. Initialize the database

```bash
npm run db:push
```

### 7. Start the development server

```bash
npm run dev
```

Open your browser and visit:

```text
http://localhost:3000
```

## 📁 Project Structure

```text
BlockGuard/
├── db/
├── prisma/
│   └── schema.prisma
├── public/
├── src/
│   ├── app/
│   │   ├── api/
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   └── ui/
│   ├── hooks/
│   └── lib/
│       ├── blockchain.ts
│       ├── db.ts
│       └── utils.ts
├── .env.example
├── package.json
└── README.md
```

## 🔗 API Routes

The application uses Next.js API routes for backend operations.

| Endpoint | Purpose |
|---|---|
| `/api/products` | Product registration and retrieval |
| `/api/verify` | Product QR verification |
| `/api/blocks` | Blockchain block information |
| `/api/stats` | Dashboard statistics |
| `/api/seed` | Sample data initialization |

## 🔒 Blockchain Implementation

BlockGuard implements a custom blockchain-inspired linked-block structure.

Each block contains:
- Block index
- Timestamp
- Product information
- Current hash
- Previous block hash
- Nonce
- Stored data

The implementation demonstrates concepts such as block linking, hash references and proof-of-work simulation.

**Note:** This project currently uses a custom blockchain simulation and a simplified hash function. It is an educational prototype, not a production-grade decentralized blockchain implementation.

## 🎯 Project Objectives

- Develop a QR-code-based product authentication system.
- Demonstrate blockchain concepts for maintaining linked product records.
- Help consumers identify products that are not registered in the system.
- Maintain verification records and improve product traceability.

## 🔮 Future Improvements

- Integrate a real cryptographic hashing algorithm such as SHA-256.
- Implement stronger blockchain integrity validation.
- Add manufacturer authentication and role-based access control.
- Integrate a real decentralized blockchain network.
- Support mobile QR-code scanning.
- Deploy the application to a cloud platform.

## 👨‍💻 Author

**Mohammed Yaassin**

- GitHub: [@YaassinMD](https://github.com/YaassinMD)
- Project: [BlockGuard](https://github.com/YaassinMD/BlockGuard)

---

⭐ If you find this project interesting, consider giving the repository a star!
