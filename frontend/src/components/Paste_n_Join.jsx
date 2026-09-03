import { useState } from "react";

export default function JoinRoomPaste() {
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState("");

  const joinRoom = async (code) => {
    const cleanedCode = code.trim().toUpperCase();

    if (!cleanedCode) {
      setError("Please paste a room code");
      return;
    }

    setError("");

    try {
      console.log("Joining room with code:", cleanedCode);
      // Replace this with your existing join-room API call or navigation logic
      // Example:
      // await api.joinRoom(cleanedCode);
      // navigate(`/room/${cleanedCode}`);
    } catch (err) {
      setError("Could not join room");
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData("text/plain");
    const cleanedText = pastedText.trim().toUpperCase();

    setRoomCode(cleanedText);
    joinRoom(cleanedText);
  };

  const handleChange = (e) => {
    setRoomCode(e.target.value);
  };

  return (
    <div>
      <input
        type="text"
        value={roomCode}
        onChange={handleChange}
        onPaste={handlePaste}
        placeholder="Paste room code"
      />
      {error ? <p>{error}</p> : null}
    </div>
  );
}