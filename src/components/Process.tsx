import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { steps } from "@/lib/content";

export function Process() {
  const [api, setApi] = useState<CarouselApi>();
  const [current, setCurrent] = useState(0);
  const [canPrevious, setCanPrevious] = useState(false);
  const [canNext, setCanNext] = useState(true);
  useEffect(() => {
    if (!api) return;
    const sync = () => {
      setCurrent(api.selectedScrollSnap());
      setCanPrevious(api.canScrollPrev());
      setCanNext(api.canScrollNext());
    };
    sync();
    api.on("select", sync);
    api.on("reInit", sync);
    return () => {
      api.off("select", sync);
      api.off("reInit", sync);
    };
  }, [api]);
  return (
    <section
      id="processo"
      className="section section-tinted"
      aria-labelledby="process-title"
    >
      <div className="shell">
        <div className="section-heading heading-split">
          <div>
            <p className="eyebrow">02 / NOSSO PROCESSO</p>
            <h2 id="process-title">
              Primeiro o problema.
              <br />
              <span>Depois, a tecnologia.</span>
            </h2>
          </div>
          <p className="section-description">
            Um caminho claro entre entender a sua operação e colocar uma solução
            para trabalhar.
          </p>
        </div>
        <Carousel
          opts={{ align: "start", containScroll: "trimSnaps" }}
          setApi={setApi}
          aria-label="Etapas do projeto"
          className="w-full"
        >
          <CarouselContent className="-ml-5 cursor-grab active:cursor-grabbing">
            {steps.map((step, index) => (
              <CarouselItem
                key={step.title}
                className="basis-[88%] py-1 pl-5 md:basis-1/2 lg:basis-[38%]"
              >
                <Card className="h-full [--card-spacing:--spacing(7)]">
                  <CardHeader>
                    <div className="step-top">
                      <span className="step-number">0{index + 1}</span>
                      <step.icon
                        className="size-6 text-primary"
                        aria-hidden="true"
                      />
                    </div>
                    <CardTitle>
                      <h3>{step.title}</h3>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <p className="body-copy">{step.text}</p>
                  </CardContent>
                  <CardFooter>
                    <span className="step-delivery">{step.delivery}</span>
                  </CardFooter>
                </Card>
              </CarouselItem>
            ))}
          </CarouselContent>
          <div className="carousel-toolbar">
            <p>
              Arraste para explorar <span aria-hidden="true">↔</span>
            </p>
            <div className="flex items-center gap-3">
              <span className="sr-only" aria-live="polite">
                Posição {current + 1} do carrossel
              </span>
              <Button
                variant="outline"
                size="icon-lg"
                aria-label="Etapas anteriores"
                disabled={!canPrevious}
                onClick={() => api?.scrollPrev()}
              >
                <ArrowLeft />
              </Button>
              <Button
                variant="outline"
                size="icon-lg"
                aria-label="Próximas etapas"
                disabled={!canNext}
                onClick={() => api?.scrollNext()}
              >
                <ArrowRight />
              </Button>
            </div>
          </div>
        </Carousel>
      </div>
    </section>
  );
}
