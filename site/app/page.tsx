import { Decode } from "@/components/scenes/Decode";
import { Readers } from "@/components/scenes/Readers";
import { Catch } from "@/components/scenes/Catch";
import { First } from "@/components/scenes/First";
import { CoverageScene } from "@/components/scenes/Coverage";
import { Close } from "@/components/scenes/Close";
import { DemoVideo } from "@/components/DemoVideo";

export default function Home() {
  return (
    <>
      <Decode />
      <Readers />
      <DemoVideo />
      <Catch />
      <First />
      <CoverageScene />
      <Close />
    </>
  );
}
