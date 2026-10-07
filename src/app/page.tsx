import Dashboard from "@/components/Dashboard";
import { defaultDataSource } from "@/lib/dataSource";

// Resolve deployment configuration at request time, rather than baking a demo
// setting into static HTML during a build.
export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <Dashboard
      initialMode={defaultDataSource(process.env.DEFAULT_DATA_SOURCE)}
    />
  );
}
