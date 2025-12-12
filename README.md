# StackSend

A peer-to-peer remittance dApp on Stacks blockchain with group contribution support, built with Clarity 4.

## Overview

StackSend enables multiple users to pool funds together for secure, low-cost international money transfers on the Stacks blockchain. This project is a Clarity 4 conversion of RemitEasy, leveraging the latest features of the Stacks ecosystem.

## Features

- **Collaborative Funding**: Multiple contributors can pool resources toward a single remittance goal
- **Escrow Protection**: Funds remain secured on-chain until the target amount is reached
- **Ultra-Low Fees**: Platform charges only 0.5% compared to traditional 5-10% remittance services
- **Real-time Tracking**: Live progress indicators and contribution status updates
- **Price Monitoring**: Oracle-powered forex alerts for optimal transfer timing
- **Recipient Control**: Only recipients can authorize fund release once targets are met
- **Automatic Refunds**: Creators can cancel and refund all contributors without penalties
- **Phone Number Integration**: Support for phone-number-based remittances

## Technology Stack

### Smart Contracts
- Clarity 4 smart contracts
- Clarinet development framework
- Stacks blockchain (testnet → mainnet)

### Frontend
- React 18 + TypeScript 5.6
- Vite 6.0 build tool
- Tailwind CSS 4.1
- Stacks.js libraries (@stacks/connect, @stacks/transactions)
- React Query for state management
- shadcn/ui component library
- Framer Motion for animations

## Project Structure

```
stacksend/
├── contracts/          # Clarity smart contracts
│   ├── stacksend-escrow.clar
│   └── stacksend-oracle.clar
├── tests/             # Contract tests
├── settings/          # Clarinet configuration
├── frontend/          # React frontend application
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   ├── services/
│   │   └── utils/
│   └── public/
├── docs/              # Documentation
├── scripts/           # Deployment and utility scripts
└── .github/           # GitHub workflows and templates
```

## Getting Started

### Prerequisites

- Node.js 18+
- Clarinet (latest version)
- Git
- Stacks wallet (Hiro, Xverse, or Leather)

### Installation

```bash
# Clone the repository
git clone https://github.com/jayteemoney/stacksend.git
cd stacksend

# Install dependencies
npm install

# Install frontend dependencies
cd frontend
npm install
cd ..
```

### Development

```bash
# Start Clarinet console
clarinet console

# Run contract tests
clarinet test

# Start frontend development server
cd frontend
npm run dev
```

### Testing

```bash
# Run all contract tests
clarinet test

# Run frontend tests
cd frontend
npm test
```

### Deployment

See [DEPLOYMENT.md](./docs/DEPLOYMENT.md) for detailed deployment instructions.

## Clarity 4 Features

This project leverages the latest Clarity 4 features:

- **contract-hash?**: On-chain contract verification
- **restrict-assets?**: Asset protection with automatic rollback
- **stacks-block-time**: Block timestamp access for time-based logic
- **to-ascii?**: String conversion for readable messages
- **secp256r1-verify**: Passkey authentication support

## Contributing

We welcome contributions! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## Security

For security concerns, please see [SECURITY.md](./SECURITY.md).

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Acknowledgments

- Original project: [RemitEasy](https://github.com/jayteemoney/remiteasy) by jayteemoney
- Built for the Stacks ecosystem
- Powered by Clarity 4

## Links

- [Documentation](./docs/)
- [Project Plan](./PROJECT_PLAN.md)
- [Stacks Documentation](https://docs.stacks.co/)
- [Clarity Language Reference](https://docs.stacks.co/clarity/)

## Development Timeline

This project is being built over 19 days with 630 focused issues. See [PROJECT_PLAN.md](./PROJECT_PLAN.md) for the complete breakdown.

---

Built with ❤️ for the Stacks community
