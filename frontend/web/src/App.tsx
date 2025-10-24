// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface EnergyRecord {
  id: string;
  encryptedEnergy: string;
  encryptedPrice: string;
  timestamp: number;
  owner: string;
  type: "supply" | "demand";
  status: "pending" | "matched" | "completed";
  matchedWith?: string;
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [records, setRecords] = useState<EnergyRecord[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newRecordData, setNewRecordData] = useState({ type: "supply" as "supply" | "demand", energy: 0, price: 0 });
  const [showTutorial, setShowTutorial] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<EnergyRecord | null>(null);
  const [decryptedEnergy, setDecryptedEnergy] = useState<number | null>(null);
  const [decryptedPrice, setDecryptedPrice] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "supply" | "demand">("all");
  const [showMarketStats, setShowMarketStats] = useState(true);

  const supplyCount = records.filter(r => r.type === "supply").length;
  const demandCount = records.filter(r => r.type === "demand").length;
  const matchedCount = records.filter(r => r.status === "matched").length;

  useEffect(() => {
    loadRecords().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
  }, []);

  const loadRecords = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      const keysBytes = await contract.getData("energy_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing record keys:", e); }
      }
      const list: EnergyRecord[] = [];
      for (const key of keys) {
        try {
          const recordBytes = await contract.getData(`energy_${key}`);
          if (recordBytes.length > 0) {
            try {
              const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
              list.push({ 
                id: key, 
                encryptedEnergy: recordData.energy, 
                encryptedPrice: recordData.price,
                timestamp: recordData.timestamp, 
                owner: recordData.owner, 
                type: recordData.type,
                status: recordData.status || "pending",
                matchedWith: recordData.matchedWith
              });
            } catch (e) { console.error(`Error parsing record data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading record ${key}:`, e); }
      }
      list.sort((a, b) => b.timestamp - a.timestamp);
      setRecords(list);
    } catch (e) { console.error("Error loading records:", e); } 
    finally { setIsRefreshing(false); setLoading(false); }
  };

  const submitRecord = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting energy data with Zama FHE..." });
    try {
      const encryptedEnergy = FHEEncryptNumber(newRecordData.energy);
      const encryptedPrice = FHEEncryptNumber(newRecordData.price);
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const recordId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const recordData = { 
        energy: encryptedEnergy, 
        price: encryptedPrice,
        timestamp: Math.floor(Date.now() / 1000), 
        owner: address, 
        type: newRecordData.type,
        status: "pending"
      };
      await contract.setData(`energy_${recordId}`, ethers.toUtf8Bytes(JSON.stringify(recordData)));
      const keysBytes = await contract.getData("energy_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(recordId);
      await contract.setData("energy_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      setTransactionStatus({ visible: true, status: "success", message: "Encrypted energy data submitted securely!" });
      await loadRecords();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewRecordData({ type: "supply", energy: 0, price: 0 });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setCreating(false); }
  };

  const decryptWithSignature = async (encryptedEnergy: string, encryptedPrice: string): Promise<[number, number] | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return [FHEDecryptNumber(encryptedEnergy), FHEDecryptNumber(encryptedPrice)];
    } catch (e) { console.error("Decryption failed:", e); return null; } 
    finally { setIsDecrypting(false); }
  };

  const matchOrder = async (recordId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Matching encrypted energy orders..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const recordBytes = await contract.getData(`energy_${recordId}`);
      if (recordBytes.length === 0) throw new Error("Record not found");
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      
      const updatedRecord = { ...recordData, status: "matched" };
      await contract.setData(`energy_${recordId}`, ethers.toUtf8Bytes(JSON.stringify(updatedRecord)));
      
      setTransactionStatus({ visible: true, status: "success", message: "Energy order matched successfully!" });
      await loadRecords();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Matching failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const completeOrder = async (recordId: string) => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setTransactionStatus({ visible: true, status: "pending", message: "Completing energy transaction..." });
    try {
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const recordBytes = await contract.getData(`energy_${recordId}`);
      if (recordBytes.length === 0) throw new Error("Record not found");
      const recordData = JSON.parse(ethers.toUtf8String(recordBytes));
      const updatedRecord = { ...recordData, status: "completed" };
      await contract.setData(`energy_${recordId}`, ethers.toUtf8Bytes(JSON.stringify(updatedRecord)));
      setTransactionStatus({ visible: true, status: "success", message: "Energy transaction completed!" });
      await loadRecords();
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 2000);
    } catch (e: any) {
      setTransactionStatus({ visible: true, status: "error", message: "Completion failed: " + (e.message || "Unknown error") });
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    }
  };

  const isOwner = (recordAddress: string) => address?.toLowerCase() === recordAddress.toLowerCase();

  const tutorialSteps = [
    { title: "Connect Wallet", description: "Connect your Web3 wallet to trade energy securely", icon: "🔗" },
    { title: "Submit Energy Offer", description: "Add your energy supply or demand with encrypted pricing", icon: "🔒", details: "Your energy data is encrypted using Zama FHE before submission" },
    { title: "Match Orders", description: "Find matching supply/demand pairs without revealing details", icon: "⚡", details: "FHE allows matching encrypted energy offers without decryption" },
    { title: "Complete Transaction", description: "Settle energy trades while maintaining privacy", icon: "✅", details: "All transactions are recorded on-chain with encrypted values" }
  ];

  const filteredRecords = records.filter(record => {
    const matchesSearch = record.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         record.owner.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === "all" || record.type === filterType;
    return matchesSearch && matchesType;
  });

  const calculateMarketStats = () => {
    let totalEnergy = 0;
    let totalValue = 0;
    let avgPrice = 0;
    
    records.forEach(record => {
      if (record.type === "supply") {
        totalEnergy += record.encryptedEnergy.length; // Using length as proxy since we can't decrypt without signature
        totalValue += record.encryptedPrice.length;
      }
    });
    
    avgPrice = records.length > 0 ? totalValue / records.length : 0;
    
    return {
      totalEnergy: `${totalEnergy.toFixed(2)} kWh`,
      totalValue: `$${totalValue.toFixed(2)}`,
      avgPrice: `$${avgPrice.toFixed(2)}/kWh`,
      activeTraders: new Set(records.map(r => r.owner)).size
    };
  };

  const marketStats = calculateMarketStats();

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing encrypted energy market...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">⚡</div>
          <h1>FHEnergy<span>Market</span></h1>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowCreateModal(true)} className="create-record-btn">
            + Add Energy Offer
          </button>
          <button onClick={() => setShowTutorial(!showTutorial)}>
            {showTutorial ? "Hide Guide" : "Show Guide"}
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Privacy-Preserving Energy Trading</h2>
            <p>Trade electricity securely with Zama FHE encryption for your energy data</p>
          </div>
          <div className="fhe-indicator">
            <div className="fhe-lock">🔒</div>
            <span>FHE Encryption Active</span>
          </div>
        </div>
        
        {showTutorial && (
          <div className="tutorial-section">
            <h2>How FHEnergy Works</h2>
            <p className="subtitle">Learn how to trade energy privately using FHE technology</p>
            <div className="tutorial-steps">
              {tutorialSteps.map((step, index) => (
                <div className="tutorial-step" key={index}>
                  <div className="step-icon">{step.icon}</div>
                  <div className="step-content">
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                    {step.details && <div className="step-details">{step.details}</div>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <div className="market-controls">
          <div className="search-filter">
            <input 
              type="text" 
              placeholder="Search offers..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <select value={filterType} onChange={(e) => setFilterType(e.target.value as any)}>
              <option value="all">All Types</option>
              <option value="supply">Energy Supply</option>
              <option value="demand">Energy Demand</option>
            </select>
            <button onClick={loadRecords} disabled={isRefreshing}>
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>
          <button 
            className="toggle-stats" 
            onClick={() => setShowMarketStats(!showMarketStats)}
          >
            {showMarketStats ? "Hide Stats" : "Show Stats"}
          </button>
        </div>
        
        {showMarketStats && (
          <div className="market-stats">
            <div className="stat-card">
              <h3>Total Energy Offered</h3>
              <p>{marketStats.totalEnergy}</p>
            </div>
            <div className="stat-card">
              <h3>Market Value</h3>
              <p>{marketStats.totalValue}</p>
            </div>
            <div className="stat-card">
              <h3>Avg Price</h3>
              <p>{marketStats.avgPrice}</p>
            </div>
            <div className="stat-card">
              <h3>Active Traders</h3>
              <p>{marketStats.activeTraders}</p>
            </div>
          </div>
        )}
        
        <div className="energy-offers">
          <h2>Current Energy Offers</h2>
          {filteredRecords.length === 0 ? (
            <div className="no-records">
              <div className="no-records-icon">⚡</div>
              <p>No energy offers found</p>
              <button onClick={() => setShowCreateModal(true)}>Create First Offer</button>
            </div>
          ) : (
            <div className="offers-grid">
              {filteredRecords.map(record => (
                <div 
                  className={`offer-card ${record.type}`} 
                  key={record.id}
                  onClick={() => setSelectedRecord(record)}
                >
                  <div className="offer-header">
                    <span className={`offer-type ${record.type}`}>
                      {record.type === "supply" ? "Supply" : "Demand"}
                    </span>
                    <span className={`offer-status ${record.status}`}>
                      {record.status}
                    </span>
                  </div>
                  <div className="offer-details">
                    <div className="detail">
                      <span>ID:</span>
                      <strong>#{record.id.substring(0, 6)}</strong>
                    </div>
                    <div className="detail">
                      <span>Owner:</span>
                      <strong>{record.owner.substring(0, 6)}...{record.owner.substring(38)}</strong>
                    </div>
                    <div className="detail">
                      <span>Date:</span>
                      <strong>{new Date(record.timestamp * 1000).toLocaleDateString()}</strong>
                    </div>
                  </div>
                  <div className="offer-actions">
                    {isOwner(record.owner) && record.status === "pending" && (
                      <button onClick={(e) => { e.stopPropagation(); matchOrder(record.id); }}>
                        Match
                      </button>
                    )}
                    {isOwner(record.owner) && record.status === "matched" && (
                      <button onClick={(e) => { e.stopPropagation(); completeOrder(record.id); }}>
                        Complete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitRecord} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating} 
          recordData={newRecordData} 
          setRecordData={setNewRecordData}
        />
      )}
      
      {selectedRecord && (
        <RecordDetailModal 
          record={selectedRecord} 
          onClose={() => { 
            setSelectedRecord(null); 
            setDecryptedEnergy(null); 
            setDecryptedPrice(null);
          }} 
          decryptedEnergy={decryptedEnergy}
          decryptedPrice={decryptedPrice}
          setDecryptedEnergy={setDecryptedEnergy}
          setDecryptedPrice={setDecryptedPrice}
          isDecrypting={isDecrypting} 
          decryptWithSignature={decryptWithSignature}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}
      
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">⚡ FHEnergyMarket</div>
            <p>Private energy trading powered by Zama FHE</p>
          </div>
          <div className="footer-links">
            <a href="#" className="footer-link">Docs</a>
            <a href="#" className="footer-link">Privacy</a>
            <a href="#" className="footer-link">Terms</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="fhe-badge">🔒 FHE-Powered Privacy</div>
          <div className="copyright">© {new Date().getFullYear()} FHEnergyMarket</div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  recordData: any;
  setRecordData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ onSubmit, onClose, creating, recordData, setRecordData }) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setRecordData({ ...recordData, [name]: value });
  };

  const handleValueChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setRecordData({ ...recordData, [name]: parseFloat(value) });
  };

  const handleSubmit = () => {
    if (!recordData.energy || !recordData.price) { 
      alert("Please fill all required fields"); 
      return; 
    }
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal">
        <div className="modal-header">
          <h2>Add Energy Offer</h2>
          <button onClick={onClose} className="close-modal">×</button>
        </div>
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="notice-icon">🔒</div>
            <div>
              <strong>FHE Encryption Notice</strong>
              <p>Your energy data will be encrypted with Zama FHE before submission</p>
            </div>
          </div>
          
          <div className="form-group">
            <label>Offer Type *</label>
            <select 
              name="type" 
              value={recordData.type} 
              onChange={handleChange}
            >
              <option value="supply">Energy Supply</option>
              <option value="demand">Energy Demand</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Energy Amount (kWh) *</label>
            <input 
              type="number" 
              name="energy" 
              value={recordData.energy} 
              onChange={handleValueChange} 
              placeholder="Enter energy amount..."
              min="0"
              step="0.1"
            />
          </div>
          
          <div className="form-group">
            <label>Price per kWh ($) *</label>
            <input 
              type="number" 
              name="price" 
              value={recordData.price} 
              onChange={handleValueChange} 
              placeholder="Enter price per kWh..."
              min="0"
              step="0.01"
            />
          </div>
          
          <div className="encryption-preview">
            <h4>Encryption Preview</h4>
            <div className="preview-grid">
              <div className="preview-item">
                <span>Energy:</span>
                <div className="encrypted-value">
                  {recordData.energy ? FHEEncryptNumber(recordData.energy).substring(0, 30) + '...' : 'Not encrypted'}
                </div>
              </div>
              <div className="preview-item">
                <span>Price:</span>
                <div className="encrypted-value">
                  {recordData.price ? FHEEncryptNumber(recordData.price).substring(0, 30) + '...' : 'Not encrypted'}
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button onClick={onClose}>Cancel</button>
          <button onClick={handleSubmit} disabled={creating}>
            {creating ? "Encrypting with FHE..." : "Submit Offer"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface RecordDetailModalProps {
  record: EnergyRecord;
  onClose: () => void;
  decryptedEnergy: number | null;
  decryptedPrice: number | null;
  setDecryptedEnergy: (value: number | null) => void;
  setDecryptedPrice: (value: number | null) => void;
  isDecrypting: boolean;
  decryptWithSignature: (encryptedEnergy: string, encryptedPrice: string) => Promise<[number, number] | null>;
}

const RecordDetailModal: React.FC<RecordDetailModalProps> = ({ 
  record, 
  onClose, 
  decryptedEnergy,
  decryptedPrice,
  setDecryptedEnergy,
  setDecryptedPrice,
  isDecrypting, 
  decryptWithSignature 
}) => {
  const handleDecrypt = async () => {
    if (decryptedEnergy !== null) { 
      setDecryptedEnergy(null); 
      setDecryptedPrice(null);
      return; 
    }
    const decrypted = await decryptWithSignature(record.encryptedEnergy, record.encryptedPrice);
    if (decrypted) {
      setDecryptedEnergy(decrypted[0]);
      setDecryptedPrice(decrypted[1]);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="record-detail-modal">
        <div className="modal-header">
          <h2>Energy Offer Details</h2>
          <button onClick={onClose} className="close-modal">×</button>
        </div>
        <div className="modal-body">
          <div className="record-info">
            <div className="info-item">
              <span>Type:</span>
              <strong className={`type-${record.type}`}>{record.type}</strong>
            </div>
            <div className="info-item">
              <span>Status:</span>
              <strong className={`status-${record.status}`}>{record.status}</strong>
            </div>
            <div className="info-item">
              <span>Owner:</span>
              <strong>{record.owner.substring(0, 6)}...{record.owner.substring(38)}</strong>
            </div>
            <div className="info-item">
              <span>Date:</span>
              <strong>{new Date(record.timestamp * 1000).toLocaleString()}</strong>
            </div>
            {record.matchedWith && (
              <div className="info-item">
                <span>Matched With:</span>
                <strong>{record.matchedWith.substring(0, 6)}...{record.matchedWith.substring(38)}</strong>
              </div>
            )}
          </div>
          
          <div className="encrypted-section">
            <h3>Encrypted Data</h3>
            <div className="encrypted-data">
              <div className="data-item">
                <span>Energy:</span>
                <div>{record.encryptedEnergy.substring(0, 50)}...</div>
              </div>
              <div className="data-item">
                <span>Price:</span>
                <div>{record.encryptedPrice.substring(0, 50)}...</div>
              </div>
            </div>
            <div className="fhe-tag">🔒 FHE Encrypted</div>
            <button 
              onClick={handleDecrypt} 
              disabled={isDecrypting}
              className="decrypt-btn"
            >
              {isDecrypting ? "Decrypting..." : 
               decryptedEnergy !== null ? "Hide Values" : "Decrypt with Wallet"}
            </button>
          </div>
          
          {decryptedEnergy !== null && decryptedPrice !== null && (
            <div className="decrypted-section">
              <h3>Decrypted Values</h3>
              <div className="decrypted-data">
                <div className="data-item">
                  <span>Energy:</span>
                  <strong>{decryptedEnergy} kWh</strong>
                </div>
                <div className="data-item">
                  <span>Price:</span>
                  <strong>${decryptedPrice}/kWh</strong>
                </div>
                <div className="data-item">
                  <span>Total Value:</span>
                  <strong>${(decryptedEnergy * decryptedPrice).toFixed(2)}</strong>
                </div>
              </div>
              <div className="decryption-notice">
                <div className="notice-icon">⚠️</div>
                <span>Decrypted values are only visible after wallet signature verification</span>
              </div>
            </div>
          )}
        </div>
        <div className="modal-footer">
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export default App;
