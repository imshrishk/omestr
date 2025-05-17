# Omestr - Decentralized Anonymous Chat on Nostr

Omestr is a decentralized, anonymous chat application built on the Nostr protocol, inspired by the classic Omegle experience. It allows users to connect randomly with strangers across the Nostr network for one-on-one conversations.

## Features

- 🎭 **Anonymous Chat**: Generates ephemeral keypairs for each session
- 🌐 **Fully Decentralized**: Built entirely on the Nostr protocol - no server required
- 🔀 **Random Matching**: Connect with random users from around the world
- 💬 **Real-time Messaging**: Instant message delivery via Nostr relays
- 🔄 **Skip Function**: Easily disconnect and find a new chat partner
- 🧹 **Auto-cleanup**: Intelligent handling of stale connections

## How It Works

### Decentralized Matchmaking

1. **Key Generation**: When you open Omestr, it generates a new Nostr keypair for your anonymous session.
2. **Broadcasting Availability**: The app broadcasts a "looking for chat" event (custom Nostr kind 30078) to Nostr relays.
3. **Finding Partners**: When another user is also looking, you establish a handshake:
   - Exchange pubkeys via Nostr events
   - Confirm the match with "matched" status
   - Generate a shared chat session ID
4. **Browser Instance Management**: Unique browser fingerprinting to prevent self-matches while allowing different browsers on the same device to match.

### Chat Implementation

- Messages are sent via Nostr DM-style events between matched users
- Each chat is isolated with a unique session ID
- Single user can only connect with one other user at a time

## Technology Stack

- **Next.js**: React framework for the frontend
- **TypeScript**: For type-safe code
- **Nostr Protocol**: Decentralized social networking protocol
- **nostr-tools**: Library for interacting with Nostr
- **TailwindCSS**: For styling the user interface

## Getting Started

### Prerequisites

- Node.js (v18 or later)
- npm or yarn

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/omestr.git
   cd omestr
   ```

2. Install dependencies:
   ```
   npm install
   # or
   yarn install
   ```

3. Run the development server:
   ```
   npm run dev
   # or
   yarn dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser to see the application.

## Testing Locally

To test the application locally:

1. Open the application in one browser
2. Open another browser (not just a new tab, but a different browser application)
3. Navigate to http://localhost:3000 in the second browser
4. The two instances should automatically find each other and connect

If connections aren't working:
1. Click the "Debug" button in the top right corner
2. Click "Reset All Data" to refresh your browser's identity
3. Try connecting again

## Deployment

The app can be deployed to Vercel with a single click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyourusername%2Fomestr)

## Technical Implementation

### Nostr Relays

Omestr connects to the following Nostr relays by default:
- wss://relay.damus.io
- wss://nostr.fmt.wiz.biz
- wss://relay.snort.social
- wss://nos.lol
- wss://relay.current.fyi
- wss://relay.nostr.band
- wss://nostr.zebedee.cloud

You can modify the relay list in `src/lib/nostr/index.ts`.

### Event Structure

#### Matchmaking Events (Kind 30078)
```json
{
  "kind": 30078,
  "created_at": 1717095600,
  "content": "",
  "tags": [
    ["status", "looking"],
    ["session", "random-session-id"],
    ["browser_id", "unique-browser-identifier"],
    ["expiry", "1717097400000"]
  ]
}
```

#### Match Confirmation
```json
{
  "kind": 30078,
  "created_at": 1717095700,
  "content": "",
  "tags": [
    ["status", "matched"],
    ["session", "random-session-id"],
    ["p", "partner-pubkey"],
    ["browser_id", "unique-browser-identifier"],
    ["chat_session", "shared-chat-session-id"]
  ]
}
```

#### Chat Messages
Messages are sent as Nostr events with tags identifying the session and recipient.

## Key Features

### Browser Instance Management
- Uses browser fingerprinting to create unique identifiers for different browsers
- Stores identifiers in sessionStorage to maintain uniqueness across tabs
- Prevents matching with yourself in different tabs/windows

### Stale User Management
- Automatically cleans up users who haven't sent events in 30 seconds
- Removes stale browser IDs and activity timestamps
- Detects and resolves situations with too many looking users

### Connection Protocol
- Implements proper handshake with timeouts and confirmation
- Includes "connecting" state with automatic fallback to "looking" if match fails
- Maintains activity tracking for each connection

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [Nostr Protocol](https://github.com/nostr-protocol/nostr)
- [nostr-tools](https://github.com/nbd-wtf/nostr-tools)
- Inspired by the original [Omegle](https://www.omegle.com/)
