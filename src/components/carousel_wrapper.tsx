import * as React from "react";

import {
  Carousel,
  CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { useSetAtom } from "jotai";
import { pageNumberAtom } from "@/stores/paragraph-atoms";

export function CarouselWrapper({
  children,
}: {
  children: React.ReactElement[];
}) {
  const [api, setApi] = React.useState<CarouselApi>();
  const setCurrent = useSetAtom(pageNumberAtom);

  React.useEffect(() => {
    if (!api) {
      return;
    }

    setCurrent(api.selectedScrollSnap());
    api.on("select", (api) => {
      // throttle(1000, () => {
      setCurrent(api.selectedScrollSnap() + 1);
      console.log("selectedScrollSnap", api.selectedScrollSnap());
      // })
    });
  }, [api]);
  return (
    <Carousel setApi={setApi} className="w-full max-w-[90vw] ">
      <CarouselContent className="-ml-4">
        {children &&
          Array.from(children).map((child, index) => (
            <CarouselItem className="" key={index + 1}>
              <div className="overflow-y-scroll h-screen max-h-[calc(100vh-100px)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {child}
              </div>
            </CarouselItem>
          ))}
      </CarouselContent>
      <CarouselPrevious />
      <CarouselNext />
    </Carousel>
  );
}
