import { useEffect, useState } from "react";

import {
  Carousel,
  CarouselApi,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { useAtom, useSetAtom } from "jotai";
import { pageNumberAtom } from "@/stores/paragraph-atoms";

/**
 * 
 * Note: The current page number is 1-indexed, but the carousel is 0-indexed.
 * So we need to subtract 1 from the current page number to get the correct index.
 * And add 1 to the selected scroll snap to get the correct index.
 * And add 1 to the current page number to get the correct index.
 * And subtract 1 from the selected scroll snap to get the correct index.
 * And add 1 to the current page number to get the correct index.
 */
export function CarouselWrapper({
  children,
}: {
  children: React.ReactElement[];
}) {
  const [api, setApi] = useState<CarouselApi>();
  const [currentPageNumber, setCurrent] = useAtom(pageNumberAtom);



  useEffect(() => {
    if (!api) {
      return;
    }
    if (currentPageNumber - 1 >= 0 && currentPageNumber - 1 !== api.selectedScrollSnap()) {
      api.scrollTo(currentPageNumber - 1);
    }
  }, [currentPageNumber]);

  useEffect(() => {
    if (!api) {
      return;
    }

    setCurrent(api.selectedScrollSnap() + 1);
    api.on("select", (api) => {
      setCurrent(api.selectedScrollSnap() + 1);
    });

    api.on("init", (api) => {
      api.scrollTo(currentPageNumber);
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
