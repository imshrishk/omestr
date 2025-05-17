import React, { useState, useEffect } from 'react';
import { DEFAULT_RELAYS } from '../lib/nostr';
import { logger } from '../lib/nostr/logger';

interface ConnectionDiagnosticsProps {
  onClearStorage: () => void;
  onRestartMatchmaking: () => void;
  connectionStatus: string;
  browserId: string;
  connectedRelays: Set<string>;
}

const ConnectionDiagnostics: React.FC<ConnectionDiagnosticsProps> = ({
  onClearStorage,
  onRestartMatchmaking,
  connectionStatus,
  browserId,
  connectedRelays
}) => {
  const [pingResults, setPingResults] = useState<Record<string, { status: string; latency?: number }>>({});
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [testResult, setTestResult] = useState<{success: boolean; message: string} | null>(null);
  
  // Ping relays to check connectivity
  const pingRelays = async () => {
    const results: Record<string, { status: string; latency?: number }> = {};
    
    // Test each relay
    for (const relay of DEFAULT_RELAYS) {
      try {
        results[relay] = { status: 'connecting' };
        setPingResults({ ...results });
        
        const startTime = performance.now();
        const ws = new WebSocket(relay);
        
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            ws.close();
            reject(new Error('Connection timeout'));
          }, 5000);
          
          ws.onopen = () => {
            clearTimeout(timeout);
            const latency = Math.round(performance.now() - startTime);
            results[relay] = { status: 'connected', latency };
            setPingResults({ ...results });
            ws.close();
            resolve();
          };
          
          ws.onerror = () => {
            clearTimeout(timeout);
            results[relay] = { status: 'failed' };
            setPingResults({ ...results });
            ws.close();
            reject(new Error('Connection failed'));
          };
        }).catch(() => {
          // Error handling done in the promise
        });
      } catch (error) {
        results[relay] = { status: 'error' };
        setPingResults({ ...results });
        logger.error(`Error testing relay ${relay}`, error);
      }
    }
  };
  
  // Test cross-device functionality
  const testCrossDeviceDiscovery = async () => {
    setTestResult({ success: false, message: "Testing..." });
    
    try {
      // Test 1: Ensure we can connect to relays
      let relaySuccess = false;
      for (const relay of DEFAULT_RELAYS) {
        try {
          const ws = new WebSocket(relay);
          await new Promise<void>((resolve, reject) => {
            const timeout = setTimeout(() => {
              ws.close();
              reject(new Error('Connection timeout'));
            }, 5000);
            
            ws.onopen = () => {
              clearTimeout(timeout);
              relaySuccess = true;
              ws.close();
              resolve();
            };
            
            ws.onerror = () => {
              clearTimeout(timeout);
              ws.close();
              reject(new Error('Connection failed'));
            };
          });
          
          if (relaySuccess) break;
        } catch (error) {
          // Try next relay
        }
      }
      
      if (!relaySuccess) {
        setTestResult({ 
          success: false, 
          message: "Failed to connect to any relays. Check your network settings and firewall." 
        });
        return;
      }
      
      // Test 2: Verify localStorage access
      const testKey = "omestr_test_" + Date.now();
      const testValue = "test_" + Math.random();
      
      try {
        localStorage.setItem(testKey, testValue);
        const readValue = localStorage.setItem(testKey, testValue);
        localStorage.removeItem(testKey);
      } catch (error) {
        setTestResult({ 
          success: false, 
          message: "LocalStorage is not working correctly. Check browser privacy settings." 
        });
        return;
      }
      
      // Generate test IDs
      const testPubkey = "test_" + Math.random().toString(36).substring(2);
      const testSessionId = "test_" + Math.random().toString(36).substring(2);
      
      // Test 3: Add and remove from looking users
      try {
        const lookingUsersKey = 'omestr_global_looking_users';
        const existingData = localStorage.getItem(lookingUsersKey) || '[]';
        const lookingUsers = JSON.parse(existingData) as string[];
        
        // Add our test pubkey
        if (!lookingUsers.includes(testPubkey)) {
          lookingUsers.push(testPubkey);
          localStorage.setItem(lookingUsersKey, JSON.stringify(lookingUsers));
        }
        
        // Check if it was added
        const updatedData = localStorage.getItem(lookingUsersKey) || '[]';
        const updatedUsers = JSON.parse(updatedData) as string[];
        
        if (!updatedUsers.includes(testPubkey)) {
          setTestResult({ 
            success: false, 
            message: "Failed to update looking users list. Check browser storage." 
          });
          return;
        }
        
        // Remove our test pubkey
        const finalUsers = updatedUsers.filter(id => id !== testPubkey);
        localStorage.setItem(lookingUsersKey, JSON.stringify(finalUsers));
      } catch (error) {
        setTestResult({ 
          success: false, 
          message: "Error while testing looking users storage. Check browser console." 
        });
        return;
      }
      
      // All tests passed
      setTestResult({ 
        success: true, 
        message: "All connectivity tests passed! Cross-device matchmaking should work." 
      });
      
    } catch (error) {
      setTestResult({ 
        success: false, 
        message: "An error occurred during testing. Check browser console." 
      });
      console.error("Cross-device test error:", error);
    }
  };
  
  useEffect(() => {
    // Automatically ping relays when component mounts
    pingRelays();
  }, []);
  
  return (
    <div className="bg-gray-900/50 backdrop-blur-sm rounded-lg p-4 border border-red-500/30">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold text-red-400">Connection Diagnostics</h3>
        <div className="space-x-2">
          <button
            onClick={() => setShowInstructions(!showInstructions)}
            className="px-3 py-1 bg-blue-600/70 hover:bg-blue-700/70 rounded-full text-xs transition-colors"
          >
            {showInstructions ? 'Hide Help' : 'Show Help'}
          </button>
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="px-3 py-1 bg-purple-600/70 hover:bg-purple-700/70 rounded-full text-xs transition-colors"
          >
            {showAdvanced ? 'Basic View' : 'Advanced View'}
          </button>
        </div>
      </div>
      
      {testResult && (
        <div className={`mb-4 p-3 rounded-lg border ${testResult.success 
          ? 'bg-green-900/30 border-green-500/30 text-green-300' 
          : 'bg-red-900/30 border-red-500/30 text-red-300'}`}>
          <div className="flex items-center space-x-2">
            <span className={`h-2.5 w-2.5 rounded-full ${testResult.success ? 'bg-green-500' : 'bg-red-500'}`}></span>
            <p className="text-sm font-medium">{testResult.message}</p>
          </div>
        </div>
      )}
      
      {showInstructions && (
        <div className="mb-4 p-3 bg-blue-900/30 rounded-lg border border-blue-500/30 text-blue-100">
          <h4 className="font-bold mb-2">Fixing Connection Issues:</h4>
          <ol className="list-decimal pl-5 space-y-1 text-sm">
            <li>Click "Reset All Data" on <strong>all</strong> devices</li>
            <li>After reset, click "Restart Matchmaking" on all devices</li>
            <li>Use completely different browsers, not just different tabs</li>
            <li>If on Vercel, try using mobile data on one device instead of Wi-Fi</li>
            <li>Check relay connections below - at least one relay must be green</li>
          </ol>
        </div>
      )}
      
      <div className="mb-4">
        <div className="flex justify-between mb-2">
          <span className="text-sm font-semibold text-gray-300">Connection Status:</span>
          <span className={`text-sm font-mono px-2 py-0.5 rounded ${
            connectionStatus === 'connected' ? 'bg-green-500/20 text-green-300' :
            connectionStatus === 'looking' ? 'bg-yellow-500/20 text-yellow-300' :
            'bg-red-500/20 text-red-300'
          }`}>
            {connectionStatus}
          </span>
        </div>
        
        <div className="flex justify-between mb-2">
          <span className="text-sm font-semibold text-gray-300">Browser ID:</span>
          <span className="text-sm font-mono text-purple-300 truncate max-w-[200px]">
            {browserId || 'Not available'}
          </span>
        </div>
        
        <div className="flex justify-between mb-2">
          <span className="text-sm font-semibold text-gray-300">Connected Relays:</span>
          <span className="text-sm font-mono text-blue-300">
            {connectedRelays.size} / {DEFAULT_RELAYS.length}
          </span>
        </div>
      </div>
      
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <h4 className="text-sm font-semibold text-gray-300">Relay Status:</h4>
          <button
            onClick={pingRelays}
            className="px-2 py-1 bg-gray-700 hover:bg-gray-600 rounded text-xs"
          >
            Test Relays
          </button>
        </div>
        
        <div className="space-y-2 max-h-40 overflow-y-auto text-xs">
          {DEFAULT_RELAYS.map(relay => (
            <div key={relay} className="flex justify-between items-center bg-gray-800/50 p-2 rounded">
              <span className="font-mono truncate max-w-[180px]">{relay}</span>
              <div className="flex items-center space-x-2">
                {showAdvanced && connectedRelays.has(relay) && (
                  <span className="px-1.5 py-0.5 bg-green-900/30 text-green-400 rounded-full text-[10px]">
                    Active
                  </span>
                )}
                
                <span className={`h-2.5 w-2.5 rounded-full ${
                  !pingResults[relay] ? 'bg-gray-600' :
                  pingResults[relay].status === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                  pingResults[relay].status === 'connected' ? 'bg-green-500' :
                  'bg-red-500'
                }`}></span>
                
                {pingResults[relay]?.latency && (
                  <span className="text-[10px] text-gray-400">
                    {pingResults[relay].latency}ms
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      
      <div className="mb-4">
        <div className="flex justify-between items-center mb-2">
          <h4 className="text-sm font-semibold text-gray-300">Cross-Device Test:</h4>
          <button
            onClick={testCrossDeviceDiscovery}
            className="px-2 py-1 bg-indigo-600/80 hover:bg-indigo-700/80 rounded text-xs"
          >
            Test Discovery
          </button>
        </div>
      </div>
      
      {showAdvanced && (
        <div className="mb-4 text-xs bg-gray-800/50 p-2 rounded">
          <div className="flex justify-between mb-1">
            <span className="text-gray-400">WebSocket Support:</span>
            <span className={typeof WebSocket !== 'undefined' ? 'text-green-400' : 'text-red-400'}>
              {typeof WebSocket !== 'undefined' ? 'Available' : 'Not Available'}
            </span>
          </div>
          <div className="flex justify-between mb-1">
            <span className="text-gray-400">BroadcastChannel Support:</span>
            <span className={typeof BroadcastChannel !== 'undefined' ? 'text-green-400' : 'text-red-400'}>
              {typeof BroadcastChannel !== 'undefined' ? 'Available' : 'Not Available'}
            </span>
          </div>
          <div className="flex justify-between mb-1">
            <span className="text-gray-400">StorageEvent Support:</span>
            <span className={'text-green-400'}>Available</span>
          </div>
          <div className="flex justify-between mb-1">
            <span className="text-gray-400">Running on Vercel:</span>
            <span className={typeof window !== 'undefined' && window.location.hostname.includes('vercel') ? 'text-yellow-400' : 'text-green-400'}>
              {typeof window !== 'undefined' && window.location.hostname.includes('vercel') ? 'Yes' : 'No'}
            </span>
          </div>
        </div>
      )}
      
      <div className="flex flex-col space-y-2">
        <button
          onClick={onClearStorage}
          className="w-full py-2 bg-red-600/80 hover:bg-red-700/80 rounded-lg font-bold transition-colors"
        >
          Reset All Data
        </button>
        
        <button
          onClick={onRestartMatchmaking}
          className="w-full py-2 bg-green-600/80 hover:bg-green-700/80 rounded-lg font-bold transition-colors"
        >
          Restart Matchmaking
        </button>
        
        <button
          onClick={() => window.location.reload()}
          className="w-full py-2 bg-blue-600/80 hover:bg-blue-700/80 rounded-lg font-bold transition-colors"
        >
          Refresh Page
        </button>
      </div>
    </div>
  );
};

export default ConnectionDiagnostics; 