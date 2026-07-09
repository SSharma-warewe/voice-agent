import { useEffect, useRef, useState, type MutableRefObject } from "react";
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

function CallLifecycle({
  roomName,
  onLeave,
  hasConnectedRef,
}: {
  roomName: string;
  onLeave: () => void;
  hasConnectedRef: MutableRefObject<boolean>;
}) {
  const connectionState = useConnectionState();

  useEffect(() => {
    if (connectionState === ConnectionState.Connected) {
      hasConnectedRef.current = true;
    }
  }, [connectionState, hasConnectedRef]);

  const handleLeave = () => {
    // Only mark abandoned after a real LiveKit session; failed mock/connect
    // should not flip appointment state or jump to a fake result page.
    if (hasConnectedRef.current) {
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
  const hasConnectedRef = useRef(false);
  const [connectError, setConnectError] = useState<string | null>(() => {
    if (!join?.token || !join?.serverUrl) {
      return "Missing LiveKit token or server URL from the API.";
    }
    if (
      join.serverUrl.includes("demo.livekit") ||
      join.token.startsWith("mock-")
    ) {
      return "Received a placeholder LiveKit URL. The app must use the real API (not mock data).";
    }
    return null;
  });

  const handleDisconnected = () => {
    // Ignore disconnects that never successfully connected.
    if (!hasConnectedRef.current) {
      setConnectError(
        "Could not connect to the voice room. Check LiveKit credentials and that the agent is running.",
      );
      return;
    }
    void markCallAbandoned(join.roomName).catch(() => undefined);
    onLeave();
  };

  if (connectError) {
    return (
      <main className="app">
        <section className="call-panel">
          <h2>Could not join call</h2>
          <p className="call-meta">{connectError}</p>
          <p className="call-meta">Room: {join.roomName}</p>
          <button type="button" className="leave-button" onClick={onLeave}>
            Back to dashboard
          </button>
        </section>
      </main>
    );
  }

  return (
    <LiveKitRoom
      token={join.token}
      serverUrl={join.serverUrl}
      connect
      audio
      video={false}
      onDisconnected={handleDisconnected}
      onError={(error) => {
        console.error("LiveKit room error:", error);
        setConnectError(error?.message || "LiveKit connection error");
      }}
      className="call-room"
    >
      <div className="call-panel">
        <h2>
          {join.booking
            ? "Call with inbound booking agent"
            : join.lead
              ? "Call with lead outreach agent"
              : "Call with confirmation agent"}
        </h2>
        <p className="call-meta">
          {join.booking
            ? "Inbound caller — provide your name and preferred appointment time"
            : join.lead
              ? `${join.lead.name} · ${join.lead.phone}`
              : join.appointment
                ? `${join.appointment.patientName} · ${join.appointment.doctorName} · ${join.appointment.appointmentDate} at ${join.appointment.appointmentTime}`
                : join.roomName}
        </p>
        <CallStatus />
        <CallLifecycle
          roomName={join.roomName}
          onLeave={onLeave}
          hasConnectedRef={hasConnectedRef}
        />
      </div>
      <RoomAudioRenderer />
    </LiveKitRoom>
  );
}