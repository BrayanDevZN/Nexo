import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import { contactUrl, solutions } from "@/lib/content";

export function SolutionsCarousel() {
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 767px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const sync = () => setMobile(media.matches);
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
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
    <Carousel
      className="solutions-carousel"
      aria-label="Serviços da Nexo"
      setApi={setApi}
      opts={{
        align: "start",
        containScroll: "trimSnaps",
        breakpoints: { "(min-width: 768px)": { active: false } },
      }}
    >
      <CarouselContent className="solutions-track">
        {solutions.map((solution, index) => (
          <CarouselItem
            key={solution.title}
            className="solution-slide"
            aria-label={solution.title}
            inert={mobile && current !== index}
            aria-hidden={mobile && current !== index}
          >
            <Card className="solution-card [--card-spacing:--spacing(7)]">
              <CardHeader>
                <div className="solution-top">
                  <div className="icon-tile">
                    <solution.icon className="size-6" aria-hidden="true" />
                  </div>
                  <span>{solution.number}</span>
                </div>
                <CardTitle>
                  <h3>{solution.title}</h3>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-6">
                <p className="body-copy">{solution.description}</p>
                <div className="service-details">
                  <p className="detail-label">
                    O QUE PODE FAZER PARTE DO PROJETO
                  </p>
                  <ul className="detail-list">
                    {solution.includes.map((detail) => (
                      <li key={detail}>
                        <Check className="size-4" aria-hidden="true" />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="service-example">
                  <p className="detail-label">NA ROTINA</p>
                  <p>{solution.example}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {solution.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </CardContent>
              <CardFooter>
                <Button variant="ghost" asChild>
                  <a
                    href={contactUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`Conversar sobre ${solution.title}`}
                  >
                    Explorar essa possibilidade{" "}
                    <ArrowUpRight data-icon="inline-end" />
                  </a>
                </Button>
              </CardFooter>
            </Card>
          </CarouselItem>
        ))}
      </CarouselContent>
      <div className="carousel-toolbar solutions-toolbar">
        <p aria-live="polite">
          {current + 1} / {solutions.length} · Arraste para explorar
        </p>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="icon-lg"
            aria-label="Serviço anterior"
            disabled={!canPrevious}
            onClick={() => api?.scrollPrev()}
          >
            <ArrowLeft />
          </Button>
          <Button
            variant="outline"
            size="icon-lg"
            aria-label="Próximo serviço"
            disabled={!canNext}
            onClick={() => api?.scrollNext()}
          >
            <ArrowRight />
          </Button>
        </div>
      </div>
    </Carousel>
  );
}
