import { useState } from "react";

export default function CopyRoomCode({ roomCode }) {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(roomCode);
      setCopied(true);
      setError("");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      setError("Could not copy room code");
    }
  };

  return (
    <div>
      <button type="button" onClick={handleCopy}>
        {copied ? "Copied!" : "Copy room code"}
      </button>
      {error ? <p>{error}</p> : null}
    </div>
  );
}