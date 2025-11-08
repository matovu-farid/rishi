import { useEffect, useRef, useState } from "react";

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

enum ProgrammaticScrollState {
  Initial,
  ProgrammaticPending,
  ProgrammaticCompleted,
}

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
  const targetIndex = currentPageNumber - 1;
  const [programmaticScrollState, setProgrammaticScrollState] = useState<ProgrammaticScrollState>(ProgrammaticScrollState.Initial);
  useEffect(() => {
    if (!api) {
      return;
    }

    if (targetIndex >= 0 && targetIndex !== api.selectedScrollSnap()) {
      setProgrammaticScrollState(ProgrammaticScrollState.ProgrammaticPending);
      api.scrollTo(targetIndex);
    }
  }, [currentPageNumber]);

  useEffect(() => {
    if (!api) {
      return;
    }
    const targetIndex = currentPageNumber - 1;
    const handleSelect = (api: CarouselApi) => {
      if (!api) {
        return;
      }
    
      
      if (programmaticScrollState === ProgrammaticScrollState.ProgrammaticPending) {
        setProgrammaticScrollState(ProgrammaticScrollState.ProgrammaticCompleted);
        return;
      }
      setCurrent(api.selectedScrollSnap() + 1);
    };
    const handleInit = (api: CarouselApi) => {
      if (!api) return;
      if (programmaticScrollState === ProgrammaticScrollState.ProgrammaticPending) {
        setProgrammaticScrollState(ProgrammaticScrollState.ProgrammaticCompleted);
        return;
      }

      if (targetIndex >= 0) {
        api.scrollTo(targetIndex);
      }
    };

    api.on("select", handleSelect);
    api.on("init", handleInit);
 
    handleInit(api);
    return () => {
      api.off("select", handleSelect);
      api.off("init", handleInit);
    };
  }, [api, setCurrent]);
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
