# BB
# BlockBase
- # On-Chain Expense Tracker DApp
This is a decentralized application (DApp) built using Solidity and React, which allows users to track shared expenses transparently on the Ethereum blockchain

Solidity feature #1: Getting your own name
JavaScript Feature #1: Display connected wallet address

 JavaScript addedCode:
{isConnected && (
  <div style={{ marginBottom: '1rem' }}>
    <strong>Connected Wallet Address:</strong>
    <p style={{ fontSize: '0.9rem', color: '#ccc' }}>{account}</p>
  </div>
)}

Solidity addedcode:
function getMyName() public view returns (string memory) {
    return people[msg.sender].name;
}
