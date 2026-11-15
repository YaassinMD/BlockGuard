# BlockGuard — Blockchain-Based Product Authenticity Verification

**Verify authenticity. Build trust. Prevent counterfeit products.**

BlockGuard is a web-based product authenticity verification platform that helps manufacturers register products and allows customers to verify whether a product is genuine using a unique QR code.

It uses a custom SHA-256 hash-linked ledger to maintain product verification records and detect unauthorized modifications, providing a transparent and tamper-evident verification process.

🌐 **Live Demo:** https://block-guard-mauve.vercel.app/  
💻 **GitHub Repository:** https://github.com/YaassinMD/BlockGuard

---

## 🚀 Key Features

- **QR-Based Product Verification:** Generate unique QR codes for registered products so customers can verify authenticity.
- **SHA-256 Product Fingerprinting:** Generate cryptographic hashes to identify product records.
- **Hash-Linked Ledger:** Maintain sequential records linked through cryptographic hashes.
- **Ledger Integrity Verification:** Detect modifications or inconsistencies in the verification chain.
- **Role-Based Access Control:** Separate access and functionality for administrators, manufacturers, and customers.
- **Manufacturer Management:** Administrators can create and manage manufacturer accounts.
- **Product Management:** Manufacturers can register and manage their own products.
- **Public Verification:** Customers can verify products without creating an account.
- **Verification History:** Maintain records of product verification activity.
- **Secure Authentication:** Authentication and server-side authorization protect restricted operations.

## 👥 User Roles

| Role | Capabilities |
|---|---|
| Admin | Manage manufacturers, view products, monitor platform statistics and ledger integrity. |
| Manufacturer | Register products, generate QR codes, and manage their own products. |
| Customer | Scan QR codes and verify product authenticity without logging in. |

## 🔄 How It Works

1. **Manufacturer Creation:** The administrator creates a manufacturer account.
2. **Product Registration:** The manufacturer logs in and registers a product.
3. **Product Fingerprinting:** The system generates a SHA-256 fingerprint for the product.
4. **Ledger Entry:** A new record is added to the hash-linked ledger.
5. **QR Generation:** The system generates a unique QR code for the registered product.
6. **Customer Verification:** A customer scans the QR code to access the verification page.
7. **Authenticity Check:** The system checks the product record and its associated ledger information.
8. **Result:** The customer receives the verification result.

## 🏗️ System Architecture

```text
                 ADMIN
                   |
          Creates Manufacturer
                   |
                   v
              MANUFACTURER
                   |
            Registers Product
                   |
                   v
          Product Fingerprinting
                   |
             SHA-256 Hash
                   |
                   v
          Hash-Linked Ledger
                   |
             QR Code Generation
                   |
                   v
                CUSTOMER
                   |
              Scans QR Code
                   |
                   v
          Product Verification
                   |
                   v
          Ledger Integrity Check
                   |
                   v
          Verification Result
```

## 🔐 Hash-Linked Ledger

BlockGuard implements a custom blockchain-inspired ledger using SHA-256 cryptographic hashing.

Each ledger block contains information such as:

- Block index
- Product reference
- Timestamp
- Current block hash
- Previous block hash

Each block is linked to the previous block through its hash, creating a sequential chain.

If the data in an existing block is modified, its hash changes, which can invalidate the subsequent links and expose inconsistencies during integrity verification.

**Note:** BlockGuard uses a centralized database with a custom hash-linked ledger. It is not a decentralized blockchain network and does not use cryptocurrency or smart contracts.

## 🛠️ Technology Stack

| Category | Technologies |
|---|---|
| Frontend | Next.js, React, TypeScript |
| Styling | Tailwind CSS, shadcn/ui |
| Backend | Next.js API Routes, Node.js |
| Database | PostgreSQL (Neon) |
| ORM | Prisma |
| Authentication | NextAuth.js |
| Cryptography | SHA-256 |
| Deployment | Vercel |
| Version Control | Git, GitHub |

## 🗄️ Database

BlockGuard uses PostgreSQL to store application data, including:

- User accounts and roles
- Manufacturer information
- Registered products
- Ledger blocks
- Product verification records

Prisma ORM is used for database access and schema management.

## ⚙️ Local Installation

### Prerequisites

- Node.js
- npm
- PostgreSQL database

### 1. Clone the repository

```bash
git clone https://github.com/YaassinMD/BlockGuard.git
cd BlockGuard
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

Create a local `.env` file using the provided `.env.example` as a reference.

Configure the required database connection and authentication environment variables.

**Important:** Never commit `.env` files, database credentials, authentication secrets, or other sensitive information.

### 4. Generate Prisma Client

```bash
npx prisma generate --schema prisma/postgresql/schema.prisma
```

### 5. Start the development server

```bash
npm run dev
```

Open the application:

```text
http://localhost:3000
```

## ☁️ Deployment

BlockGuard is deployed using:

- **Application Hosting:** Vercel
- **Database Hosting:** Neon PostgreSQL
- **Repository:** GitHub

Live application: https://block-guard-mauve.vercel.app/

## 🔒 Security Considerations

- Role-based authorization for protected operations.
- Server-side ownership checks for manufacturer products.
- Cryptographic SHA-256 hashing for product fingerprints and ledger links.
- Environment-based configuration for sensitive credentials.
- Public verification separated from authenticated management operations.

## 🎯 Project Objectives

1. Develop a reliable platform for product authenticity verification.
2. Use cryptographic hashing to create tamper-evident product records.
3. Provide QR-based verification accessible to customers.
4. Implement role-based access and manufacturer-specific product management.
5. Demonstrate how blockchain-inspired concepts can improve transparency and traceability.

## 🔮 Future Enhancements

- Integration with IoT-based product tracking.
- Enhanced analytics and reporting.
- Product lifecycle tracking.
- Support for additional verification mechanisms.
- Expanded audit and monitoring capabilities.

## 👨‍💻 Author

**Mohammed Yaassin**

Computer Science and Engineering Student

- GitHub: [@YaassinMD](https://github.com/YaassinMD)

---

⭐ If you find this project interesting, consider giving the repository a star!
