import { readPulsePilot } from "@/lib/pulsePilot";
/** Local diagnostic only. Refreshing the UI never makes a provider request. */
export async function GET() {
  const configured = Boolean(process.env.PULSESCORE_KEY);
  const lastPilot = await readPulsePilot();
  return Response.json(
    {
      provider: "pulsescore",
      configured,
      authentication:
        configured && lastPilot
          ? lastPilot.ok
            ? "last_pilot_succeeded"
            : "last_pilot_failed"
          : "not_verified",
      lastPilot,
      automaticCollection: false,
      pilotMaxRequests: 1,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
