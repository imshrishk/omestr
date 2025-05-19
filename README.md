# Omestr - Anonymous Chat on Nostr

Omestr is a decentralized, anonymous chat application built on the Nostr protocol, inspired by the classic Omegle experience. It allows users to connect randomly with strangers across the Nostr network for one-on-one conversations.

## Features

- 🎭 **Anonymous Chat**: Generate ephemeral keypairs for each session
- 🌐 **Decentralized**: Powered by the Nostr protocol and relay network
- 🔀 **Random Matching**: Connect with random users from around the world
- 💬 **Real-time Messaging**: Instant message delivery via Nostr relays
- 🔄 **Skip Function**: Easily disconnect and find a new chat partner
- ⏱️ **Connection Timer**: See how long you've been chatting with your partner
- 🔔 **Sound Notifications**: Audio alerts for new messages and connections
- 😀 **Emoji Reactions**: React to messages with emoji

## Technology Stack

- **Next.js**: React framework for the frontend
- **TypeScript**: For type-safe code
- **Nostr Protocol**: Decentralized social networking protocol
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

## How It Works

1. **Key Generation**: When you open Omestr, it generates a new Nostr keypair for your anonymous session.
2. **Finding Partners**: The app broadcasts a "looking for chat" event to Nostr relays.
3. **Matching**: When another user is also looking, you're matched together.
4. **Chatting**: Chat messages are sent via Nostr relays between matched users.
5. **Next**: Click "Next" to end the current chat and find a new partner.

## Deployment

The app can be deployed to Vercel with a single click:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fyourusername%2Fomestr)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgements

- [Nostr Protocol](https://github.com/nostr-protocol/nostr)
- [nostr-tools](https://github.com/nbd-wtf/nostr-tools)
- Inspired by the original [Omegle](https://www.omegle.com/)

## Sound Files

The application uses sound notifications for various events. You'll need to add your own sound files to the `public/sounds` directory:

- `message.mp3`: Played when receiving a new message
- `connect.mp3`: Played when connecting with a new partner
- `disconnect.mp3`: Played when disconnecting from a chat

You can use any MP3 files of your choice, just make sure they're short and appropriate for notifications.
