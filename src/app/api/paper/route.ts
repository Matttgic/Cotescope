import { readPaperDashboard } from "@/lib/paperStore";
export async function GET() {
  try {
    return Response.json({
      ...(await readPaperDashboard()),
      simulation: true,
      cronConfigured: Boolean(process.env.CRON_SECRET),
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      {
        simulation: true,
        error:
          error instanceof Error && error.message === "database_not_configured"
            ? "database_not_configured"
            : "paper_read_failed",
      },
      { status: 503 },
    );
  }
}
