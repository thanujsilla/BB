import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import './App.css';
import ExpenseTrackerABI from './ExpenseTrackerABI.json';

function App() {
  const [provider, setProvider] = useState(null);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [name, setName] = useState('');
  const [expenses, setExpenses] = useState([]);
  const [people, setPeople] = useState([]);
  const [loadingExpenses, setLoadingExpenses] = useState(false);
  const [expenseLabel, setExpenseLabel] = useState('');
  const [participants, setParticipants] = useState([{ address: '', amountPaid: 0, amountOwed: 0 }]);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const contractAddress = "0xea9edb42af0495b5505a7c0b1ac1aa1832ed0fe5";

  useEffect(() => {
    const init = async () => {
      if (window.ethereum) {
        try {
          await window.ethereum.request({ method: 'eth_requestAccounts' });
          const providerInstance = new ethers.providers.Web3Provider(window.ethereum);
          setProvider(providerInstance);

          const network = await providerInstance.getNetwork();
          if (network.chainId !== 11155111) {
            alert("Please connect to Sepolia testnet.");
            return;
          }

          const signer = providerInstance.getSigner();
          const address = await signer.getAddress();
          setAccount(address);
          setIsConnected(true);

          const contractInstance = new ethers.Contract(contractAddress, ExpenseTrackerABI, signer);
          setContract(contractInstance);

          window.ethereum.on('accountsChanged', (accounts) => {
            setAccount(accounts[0] || '');
            setIsConnected(accounts.length > 0);
          });

        } catch (error) {
          console.error("Initialization error:", error);
        }
      } else {
        alert("Please install MetaMask.");
      }
    };

    init();

    return () => {
      if (window.ethereum) {
        window.ethereum.removeAllListeners('accountsChanged');
      }
    };
  }, []);

  useEffect(() => {
    const checkRegistration = async () => {
      if (!contract || !account) return;

      try {
        const person = await contract.getPerson(account);
        const registered = person.walletAddress !== ethers.constants.AddressZero;
        setIsRegistered(registered);

        if (registered) {
          setName(person.name);
          await loadExpenses();
          await loadPeople();
        }
      } catch (error) {
        console.error("Error checking registration:", error);
      }
    };
    checkRegistration();
  }, [contract, account]);

  useEffect(() => {
    if (expenses.length > 0) {
      console.log("LOADED EXPENSES:", expenses);
      console.log("LOADED PEOPLE:", people);

      expenses.forEach(expense => {
        console.log(`Expense: ${expense.label}`);
        expense.participants.forEach(p => {
          console.log(`  Participant: ${p.address.substring(0, 8)}...`);
          console.log(`    Paid: ${p.amountPaid} ETH, Owes: ${p.amountOwed} ETH`);
          console.log(`    Net: ${parseFloat(p.amountPaid) - parseFloat(p.amountOwed)} ETH`);
        });
      });
    }
  }, [expenses, people]);

  const registerPerson = async () => {
    if (!name.trim()) {
      alert("Please enter your name.");
      return;
    }
    try {
      const tx = await contract.registerPerson(name.trim());
      await tx.wait();
      setIsRegistered(true);
      alert("Registration successful!");
      await loadPeople();
      await loadExpenses();
    } catch (error) {
      console.error("Registration failed:", error);
      alert(`Registration failed: ${error.message}`);
    }
  };

  const loadExpenses = async () => {
    if (!contract || !isRegistered) return;
    setLoadingExpenses(true);
    try {
      const count = await contract.expenseCount();
      const loaded = [];

      for (let i = 0; i < count; i++) {
        try {
          const [id, label, timestamp] = await contract.getExpenseBasicInfo(i);
          const participantsAddresses = await contract.getExpenseParticipants(i);

          const participantsData = await Promise.all(
            participantsAddresses.map(async (address) => {
              try {
                const amountPaid = await contract.getAmountPaid(i, address);
                const amountOwed = await contract.getAmountOwed(i, address);
                return {
                  address,
                  amountPaid: ethers.utils.formatEther(amountPaid),
                  amountOwed: ethers.utils.formatEther(amountOwed),
                };
              } catch (error) {
                console.error(`Error loading amounts for participant ${address}:`, error);
                return { address, amountPaid: "0", amountOwed: "0" };
              }
            })
          );

          loaded.push({
            id: id.toNumber(),
            label,
            timestamp: new Date(timestamp.toNumber() * 1000).toLocaleString(),
            participants: participantsData,
          });
        } catch (error) {
          console.error(`Error loading expense ${i}:`, error);
        }
      }

      setExpenses(loaded);
    } catch (error) {
      console.error("Error loading expenses:", error);
      alert("Could not load expenses. Check console.");
    } finally {
      setLoadingExpenses(false);
    }
  };

  const loadPeople = async () => {
    if (!contract) return;
    try {
      const addresses = await contract.getAllRegisteredPeople();
      const peopleData = await Promise.all(
        addresses.map(async (address) => {
          const person = await contract.getPerson(address);
          const netBalance = await contract.getNetBalance(address);
          return {
            address,
            name: person.name,
            netBalance: ethers.utils.formatEther(netBalance),
          };
        })
      );
      setPeople(peopleData);
    } catch (error) {
      console.error("Error loading people:", error);
    }
  };

  const addExpense = async () => {
    if (!expenseLabel.trim()) {
      alert("Enter an expense label.");
      return;
    }
    if (participants.length === 0) {
      alert("Add at least one participant.");
      return;
    }

    for (const participant of participants) {
      if (!participant.address || participant.amountPaid < 0 || participant.amountOwed < 0) {
        alert("Participant details are invalid.");
        return;
      }
    }

    try {
      const addresses = participants.map(p => p.address.trim());
      const paidAmounts = participants.map(p => ethers.utils.parseEther(p.amountPaid.toString()));
      const owedAmounts = participants.map(p => ethers.utils.parseEther(p.amountOwed.toString()));

      const tx = await contract.addExpense(expenseLabel, addresses, paidAmounts, owedAmounts);
      await tx.wait();

      setExpenseLabel('');
      setParticipants([{ address: '', amountPaid: 0, amountOwed: 0 }]);
      setShowAddExpense(false);
      await loadExpenses();
      await loadPeople();
    } catch (error) {
      console.error("Error adding expense:", error);
      alert(`Error: ${error.message}`);
    }
  };

  const addParticipant = () => {
    setParticipants([...participants, { address: '', amountPaid: 0, amountOwed: 0 }]);
  };

  const updateParticipant = (index, field, value) => {
    const updated = [...participants];
    updated[index][field] = value;
    setParticipants(updated);
  };

  const removeParticipant = (index) => {
    if (participants.length > 1) {
      setParticipants(participants.filter((_, i) => i !== index));
    }
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>On-Chain Expense Tracker</h1>

        {/* JavaScript Feature 1: Display connected wallet address */}
        {isConnected && (
          <div style={{ marginBottom: '1rem' }}>
            <strong>Connected Wallet Address:</strong>
            <p style={{ fontSize: '0.9rem', color: '#ccc' }}>{account}</p>
          </div>
        )}

        {!isConnected ? (
          <button onClick={() => window.ethereum.request({ method: 'eth_requestAccounts' })}>
            Connect Wallet
          </button>
        ) : !isRegistered ? (
          <div>
            <h2>Register</h2>
            <input
              type="text"
              placeholder="Your Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button onClick={registerPerson}>Register</button>
          </div>
        ) : (
          <div>
            <h2>Welcome, {name}</h2>
            <p>Account: {account}</p>
            <button onClick={() => setShowAddExpense(!showAddExpense)}>
              {showAddExpense ? "Cancel" : "Add Expense"}
            </button>
            <button onClick={loadExpenses}>Refresh Expenses</button>

            {showAddExpense && (
              <div>
                <h3>New Expense</h3>
                <input
                  type="text"
                  placeholder="Expense Label"
                  value={expenseLabel}
                  onChange={(e) => setExpenseLabel(e.target.value)}
                />
                {participants.map((p, idx) => (
                  <div key={idx}>
                    <input
                      placeholder="Address"
                      value={p.address}
                      onChange={(e) => updateParticipant(idx, 'address', e.target.value)}
                    />
                    <input
                      type="number"
                      placeholder="Paid"
                      value={p.amountPaid}
                      onChange={(e) => updateParticipant(idx, 'amountPaid', e.target.value)}
                    />
                    <input
                      type="number"
                      placeholder="Owed"
                      value={p.amountOwed}
                      onChange={(e) => updateParticipant(idx, 'amountOwed', e.target.value)}
                    />
                    <button onClick={() => removeParticipant(idx)}>Remove</button>
                  </div>
                ))}
                <button onClick={addParticipant}>Add Participant</button>
                <button onClick={addExpense}>Save Expense</button>
              </div>
            )}

            <h3>People</h3>
            <table style={{ borderCollapse: 'collapse', margin: '10px 0' }}>
              <thead>
                <tr>
                  <th style={{ padding: '8px', border: '1px solid #ddd' }}>Name</th>
                  <th style={{ padding: '8px', border: '1px solid #ddd' }}>Address</th>
                  <th style={{ padding: '8px', border: '1px solid #ddd' }}>Net Balance</th>
                </tr>
              </thead>
              <tbody>
                {people.map((person, idx) => (
                  <tr key={idx}>
                    <td style={{ padding: '8px', border: '1px solid #ddd' }}>{person.name}</td>
                    <td style={{ padding: '8px', border: '1px solid #ddd' }}>{person.address.substring(0, 8)}...</td>
                    <td style={{ padding: '8px', border: '1px solid #ddd', color: parseFloat(person.netBalance) < 0 ? 'red' : 'green' }}>
                      {parseFloat(person.netBalance).toFixed(5)} ETH
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3>Expense History</h3>
            {loadingExpenses ? <p>Loading...</p> : (
              expenses.map(expense => (
                <div key={expense.id} style={{ border: '1px solid #ddd', margin: '10px 0', padding: '10px' }}>
                  <h4>{expense.label}</h4>
                  <p>{expense.timestamp}</p>
                  <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                      <tr>
                        <th style={{ padding: '5px', border: '1px solid #ddd' }}>Participant</th>
                        <th style={{ padding: '5px', border: '1px solid #ddd' }}>Paid</th>
                        <th style={{ padding: '5px', border: '1px solid #ddd' }}>Owes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expense.participants.map((p, idx) => (
                        <tr key={idx}>
                          <td style={{ padding: '5px', border: '1px solid #ddd' }}>
                            {people.find(person => person.address === p.address)?.name || p.address.substring(0, 8)}...
                          </td>
                          <td style={{ padding: '5px', border: '1px solid #ddd' }}>{p.amountPaid} ETH</td>
                          <td style={{ padding: '5px', border: '1px solid #ddd' }}>{p.amountOwed} ETH</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))
            )}
          </div>
        )}
      </header>
    </div>
  );
}

export default App;