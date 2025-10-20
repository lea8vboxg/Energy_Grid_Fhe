# Energy Grid FHE: A Privacy-First P2P Energy Trading Marketplace

Energy Grid FHE is a pioneering platform designed for the decentralized trading of energy within smart grids, leveraging **Zama's Fully Homomorphic Encryption technology** to ensure user privacy and secure transactions. This project offers a robust solution for peer-to-peer electricity trading, where households and businesses can buy and sell electricity without compromising their power consumption and production data.

## The Problem: Privacy in Energy Trading

As the world moves towards more decentralized energy solutions, the need for privacy in energy trading becomes increasingly vital. Traditional energy marketplaces expose sensitive user data, putting individuals and businesses at risk of exploitation and unwanted attention. This lack of security can deter participation in energy trading, ultimately limiting community growth and innovation.

## FHE: The Game-Changing Solution

**Zama's Fully Homomorphic Encryption (FHE)** addresses this pivotal concern by enabling computations on encrypted data without exposing that data itself. Our implementation utilizes Zama's open-source libraries, such as **Concrete** and **TFHE-rs**, to facilitate secure and confidential transactions in the Energy Grid FHE marketplace. With this technology, energy data is encrypted before it enters the trading platform, ensuring that it remains private even during processing and trading activities. This revolutionary approach guarantees that users can engage in the energy market while keeping their personal usage patterns confidential.

## Key Features

- **FHE Encrypted User Data:** All power consumption and generation data is protected by FHE, maintaining user privacy.
- **Decentralized Exchange (DEX):** A private decentralized exchange allows seamless trading of electricity, empowering users to transact without third-party involvement.
- **Optimized Grid Efficiency:** Enhance the efficiency of the energy grid while safeguarding user data and privacy.
- **Community-Driven Design:** Built for community engagement, facilitating local energy trading between individuals and businesses.

## Technology Stack

- **Zama SDKs:** Concrete, TFHE-rs
- **Blockchain Framework:** Ethereum (via smart contracts)
- **Development Environment:** Node.js, Hardhat/Foundry
- **Frontend Framework:** React (if applicable)

## Directory Structure

Here’s an overview of the project directory structure:

```
Energy_Grid_Fhe/
│
├── contracts/
│   └── Energy_Grid_FHE.sol
│
├── src/
│   ├── app.js
│   └── components/
│       └── TradingDashboard.js
│
├── tests/
│   └── EnergyGrid.test.js
│
├── package.json
└── README.md
```

## Installation Guide

Before you can run Energy Grid FHE, make sure you have the following installed:

- **Node.js** (version 14 or higher)
- **Hardhat or Foundry** (for smart contract compilation and testing)

After ensuring you have the necessary dependencies, follow these instructions:

1. Navigate to the project directory.
2. Run the following command to install dependencies:
   ```bash
   npm install
   ```

> **Note:** Do not use `git clone` or any URLs to download this project. Ensure you have downloaded the project files directly before running the installation command.

## Build & Run Guide

Once the installation is complete, follow these steps to compile, test, and run the project:

1. **Compile the Smart Contracts:**
   ```bash
   npx hardhat compile
   ```

2. **Run Tests:**
   ```bash
   npx hardhat test
   ```

3. **Start the Development Server:**
   If you have a frontend:
   ```bash
   npm start
   ```
   Or deploy on the local blockchain:
   ```bash
   npx hardhat run scripts/deploy.js
   ```

## Example Code Snippet

Here’s a sample code snippet demonstrating how to make a power transaction using the Energy Grid FHE platform:

```javascript
async function makeTrade(userFrom, userTo, energyAmount) {
    const tradeTransaction = await EnergyGridFHEContract.makeTrade(
        userFrom,
        userTo,
        energyAmount
    );

    console.log(`Trade successful! ${energyAmount} kWh transferred from ${userFrom} to ${userTo}.`);
}
```

This function outlines how users can execute energy trades while ensuring that all operations comply with privacy norms dictated by homomorphic encryption.

## Acknowledgements

### Powered by Zama

We would like to extend our heartfelt gratitude to the Zama team for their groundbreaking work in developing the Fully Homomorphic Encryption technology and their open-source tools that enable us to build and deploy confidential blockchain applications effectively. Your innovation is truly vital for the future of secure digital transactions in the energy sector.
