import { useState, useEffect, useRef } from "react";
import axios from "axios";

const LOCK_COLOR = "currentColor";

// How long to keep the pulsing "pending" ring before giving up on seeing the
// state flip we asked for.
const PENDING_TIMEOUT_MS = 15000;

const BatteryGauge = ({ percent }) => {
  if (percent === null) return null;

  const isError = percent === 999;
  const clamped = isError ? 0 : Math.min(100, Math.max(0, percent));
  const color = isError
    ? "bg-gray-400"
    : clamped <= 20
      ? "bg-red-500"
      : clamped <= 50
        ? "bg-yellow-400"
        : "bg-green-500";
  const label = isError ? "?" : `${clamped}%`;

  return (
    <div className="flex items-center gap-2 opacity-60">
      <div className="relative w-20 h-3 rounded-sm border border-current overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 ${color} transition-all duration-500`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className="text-xs tabular-nums">{label}</span>
    </div>
  );
};

export const Lock = () => {
  const [doorState, setDoorState] = useState("unknown");
  const [isToggling, setIsToggling] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const [batteryPercent, setBatteryPercent] = useState(null);
  const prevStateRef = useRef(null);
  const pendingTimeoutRef = useRef(null);

  const fetchState = () => {
    axios
      .get("/state")
      .then((response) => {
        const newState = response.data.state;
        setDoorState(newState);
        if (
          prevStateRef.current !== null &&
          newState !== prevStateRef.current
        ) {
          prevStateRef.current = null;
          clearTimeout(pendingTimeoutRef.current);
          setIsPending(false);
        }
      })
      .catch(() => {});
  };

  const fetchBattery = () => {
    axios
      .get("/battery")
      .then((response) => setBatteryPercent(response.data.battery))
      .catch(() => {});
  };

  useEffect(() => {
    fetchState();
    const interval = setInterval(fetchState, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchBattery();
    const interval = setInterval(fetchBattery, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => () => clearTimeout(pendingTimeoutRef.current), []);

  const doCommand = (action) => {
    if (isToggling) return;
    const endpoint = action === "open" ? "/open" : "/close";
    setIsToggling(true);
    axios
      .post(endpoint)
      .then(() => {
        setIsToggling(false);
        prevStateRef.current = doorState;
        setIsPending(true);
        clearTimeout(pendingTimeoutRef.current);
        pendingTimeoutRef.current = setTimeout(() => {
          prevStateRef.current = null;
          setIsPending(false);
        }, PENDING_TIMEOUT_MS);
      })
      .catch(() => {
        alert("could not send command");
        setIsToggling(false);
      });
  };

  return (
    <div className="w-full h-screen flex items-center justify-center">
      <div className="w-full max-w-md p-4">
        <div className="text-center w-full flex flex-col items-center justify-center space-y-6">
          <div className="relative inline-flex items-center justify-center">
            {isPending && (
              <span className="absolute inline-flex h-full w-full rounded-full bg-current opacity-20 animate-ping-fast"></span>
            )}
            {isToggling ? (
              <span className="loading loading-infinity loading-lg"></span>
            ) : doorState === "open" ? (
              <svg
                className={isPending ? "opacity-30" : ""}
                width="200px"
                height="200px"
                viewBox="0 0 16 16"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M11.5 2C10.6716 2 10 2.67157 10 3.5V6H13V16H1V6H8V3.5C8 1.567 9.567 0 11.5 0C13.433 0 15 1.567 15 3.5V4H13V3.5C13 2.67157 12.3284 2 11.5 2ZM9 10H5V12H9V10Z"
                  fill={LOCK_COLOR}
                />
              </svg>
            ) : doorState === "closed" ? (
              <svg
                className={isPending ? "opacity-30" : ""}
                width="200"
                height="200px"
                viewBox="0 0 16 16"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fillRule="evenodd"
                  clipRule="evenodd"
                  d="M4 6V4C4 1.79086 5.79086 0 8 0C10.2091 0 12 1.79086 12 4V6H14V16H2V6H4ZM6 4C6 2.89543 6.89543 2 8 2C9.10457 2 10 2.89543 10 4V6H6V4ZM7 13V9H9V13H7Z"
                  fill={LOCK_COLOR}
                />
              </svg>
            ) : (
              <span className="loading loading-infinity loading-lg"></span>
            )}
          </div>
          <BatteryGauge percent={batteryPercent} />
          <div className="flex gap-4 w-full">
            <button
              onClick={() => doCommand("open")}
              className={`btn btn-lg btn-glass flex-1 transition-opacity ${
                doorState === "closed" ? "opacity-100" : "opacity-30"
              }`}
            >
              Unlock
            </button>
            <button
              onClick={() => doCommand("close")}
              className={`btn btn-lg btn-glass flex-1 transition-opacity ${
                doorState === "open" ? "opacity-100" : "opacity-30"
              }`}
            >
              Lock
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
