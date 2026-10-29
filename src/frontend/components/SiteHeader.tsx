import { useState } from "react";
import { ArrowUpRight, Menu } from "lucide-react";
import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { contactUrl, navigation } from "@/lib/content";

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  return (
    <header className="nx-header">
      <div className="nx-wrap nx-header-inner">
        <a href="#inicio" aria-label="Nexo: início">
          <Brand />
        </a>
        <nav className="nx-nav" aria-label="Navegação principal">
          {navigation.map((item) => (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ))}
        </nav>
        <div className="nx-header-cta">
          <Button variant="outline" size="lg" asChild>
            <a href={contactUrl} target="_blank" rel="noopener noreferrer">
              Vamos conversar <ArrowUpRight data-icon="inline-end" />
            </a>
          </Button>
        </div>
        <div className="nx-header-menu">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" size="icon-lg" aria-label="Abrir menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>Explore a Nexo</SheetTitle>
                <SheetDescription>IA aplicada ao seu negócio.</SheetDescription>
              </SheetHeader>
              <nav
                className="flex flex-col gap-2 px-4"
                aria-label="Navegação mobile"
              >
                {navigation.map((item) => (
                  <Button key={item.href} variant="ghost" size="lg" asChild>
                    <a href={item.href} onClick={() => setOpen(false)}>
                      {item.label}
                    </a>
                  </Button>
                ))}
                <Button size="lg" asChild>
                  <a
                    href={contactUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => setOpen(false)}
                  >
                    Vamos conversar <ArrowUpRight data-icon="inline-end" />
                  </a>
                </Button>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
