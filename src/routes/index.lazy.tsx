import FileDrop from "@components/FileComponent";
import { createLazyFileRoute } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="grid place-items-center h-screen">
      <FileDrop />
    </div>
  );
}
