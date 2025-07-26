import { Progress } from "./ui/progress";
export const ProgressBar = ({ v }: { v: number }) => (
  <Progress value={v * 100} />
);
