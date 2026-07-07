import { useEffect, useRef, useState } from "react";
import {
  LiveKitRoom,
  RoomAudioRenderer,
  useConnectionState,
  useRoomContext,
} from "@livekit/components-react";
import { ConnectionState, RoomEvent } from "livekit-client";
import { markCallAbandoned, type JoinResponse } from "./api";

interface CallRoomProps {
  join: JoinResponse;
  onLeave: () => void;
}

function CallStatus() {
  const room = useRoomContext();
  const connectionState = useConnectionState();
  const [agentPresent, setAgentPresent] = useState(false);

  useEffect(() => {
    const checkParticipants = () => {
      setAgentPresent(room.remoteParticipants.size > 0);
    };

    checkParticipants();
    room.on(RoomEvent.ParticipantConnected, checkParticipants);
    room.on(RoomEvent.ParticipantDisconnected, checkParticipants);

    return () => {
      room.off(RoomEvent.ParticipantConnected, checkParticipants);
      room.off(RoomEvent.ParticipantDisconnected, checkParticipants);
    };
  }, [room]);

  const statusText =
    connectionState !== ConnectionState.Connected
      ? "Connecting…"
      : agentPresent
        ? "Agent connected — speak when ready"
        : "Connected — waiting for agent";

  return <p className="call-status">{statusText}</p>;
}

function CallLifecycle({ roomName, onLeave }: { roomName: string; onLeave: () => void }) {
  const connectionState = useConnectionState();
  const hasConnected = useRef(false);

  useEffect(() => {
    if (connectionState === ConnectionState.Connected) {
      hasConnected.current = true;
    }
  }, [connectionState]);

  const handleLeave = () => {
    if (hasConnected.current) {
      void markCallAbandoned(roomName).catch(() => undefined);
    }
    onLeave();
  };

  return (
    <button type="button" className="leave-button" onClick={handleLeave}>
      Leave call
    </button>
  );
}

export default function CallRoom({ join, onLeave }: CallRoomProps) {
  const handleDisconnected = () => {
    void markCallAbandoned(join.roomName).catch(() => undefined);
    onLeave();
  };

  return (
    <LiveKitRoom
      token={join.token}
      serverUrl={join.serverUrl}
      connect
      audio
      video={false}
      onDisconnected={handleDisconnected}
      className="call-room"
    >
      <div className="call-panel">
        <h2>Call with confirmation agent</h2>
        <p className="call-meta">
          {join.appointment.patientName} · {join.appointment.doctorName} ·{" "}
          {join.appointment.appointmentDate} at {join.appointment.appointmentTime}
        </p>
        <CallStatus />
        <CallLifecycle roomName={join.roomName} onLeave={onLeave} />
      </div>
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}