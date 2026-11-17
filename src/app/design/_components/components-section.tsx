"use client";

import { useState } from "react";
import {
  ArrowRightIcon,
  ArrowUpIcon,
  CircleCheckIcon,
  CodeIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  FolderIcon,
  HouseIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { FileIcon } from "@/components/files/file-icon";
import { GithubIcon } from "@/components/icons/github-icon";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { sampleActivity, sampleProjects } from "../_data/fixtures";
import { DesignSection, Example } from "./section";

const sortItems = [
  { label: "Last edited", value: "edited" },
  { label: "Name", value: "name" },
  { label: "Created", value: "created" },
];

const amounts = [5, 10, 25, 50, 100];

const numberFormat = new Intl.NumberFormat("en-US", { signDisplay: "always" });

export function ComponentsSection() {
  const [amount, setAmount] = useState(25);

  return (
    <DesignSection
      id="components"
      description="shadcn/ui on Base UI, restyled to the flat tokens."
    >
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Example title="Button" description="Variants, sizes, icons.">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
            <Button variant="accent" size="chip">
              <ArrowRightIcon data-icon="inline-start" />
              Accent chip
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="lg">
              <PlusIcon data-icon="inline-start" />
              New project
            </Button>
            <Button size="sm" variant="outline">
              Top up
            </Button>
            <Button size="xs" variant="outline">
              <DownloadIcon data-icon="inline-start" />
              Export
            </Button>
            <Button size="icon" variant="outline" aria-label="Copy">
              <CopyIcon />
            </Button>
            <Button size="icon-sm" aria-label="Send">
              <ArrowUpIcon />
            </Button>
            <Button variant="outline">
              <GithubIcon data-icon="inline-start" />
              Export to GitHub
            </Button>
          </div>
        </Example>

        <Example title="Badge">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>Badge</Badge>
            <Badge variant="secondary">Secondary</Badge>
            <Badge variant="outline">Outline</Badge>
            <Badge variant="success">
              <CircleCheckIcon data-icon="inline-start" />
              Completed
            </Badge>
            <Badge variant="outline" className="font-mono">
              <FileIcon path="page.tsx" data-icon="inline-start" />
              page.tsx
            </Badge>
            <Badge variant="destructive">Failed</Badge>
            <Badge variant="outline">
              <GithubIcon data-icon="inline-start" />
              On GitHub
            </Badge>
            <Badge variant="outline" className="max-w-40">
              <span className="truncate">
                A very long badge label that should truncate cleanly
              </span>
            </Badge>
          </div>
        </Example>

        <Example title="Input · Tabs">
          <div className="flex flex-wrap items-center gap-3">
            <Input
              placeholder="Project name"
              aria-label="Project name"
              className="max-w-sm flex-1"
            />
            <Tabs defaultValue="preview">
              <TabsList>
                <TabsTrigger value="preview">
                  <EyeIcon data-icon="inline-start" />
                  Preview
                </TabsTrigger>
                <TabsTrigger value="code">
                  <CodeIcon data-icon="inline-start" />
                  Code
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative max-w-sm flex-1">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search projects…"
                aria-label="Search projects"
                className="pl-9"
              />
            </div>
            <Tabs defaultValue="all">
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="github">On GitHub</TabsTrigger>
                <TabsTrigger value="local">Not exported</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <Tabs defaultValue="overview">
            <TabsList variant="line">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="text-muted-foreground">
              Line tabs for secondary navigation.
            </TabsContent>
            <TabsContent value="activity" className="text-muted-foreground">
              No activity yet.
            </TabsContent>
          </Tabs>
        </Example>

        <Example title="Textarea · Select">
          <Textarea
            placeholder="Describe what you want to change…"
            aria-label="Describe a change"
          />
          <Select items={sortItems} defaultValue="edited">
            <SelectTrigger aria-label="Sort projects" className="w-48">
              <span className="text-muted-foreground">Sort:</span>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {sortItems.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Example>

        <Example
          title="ToggleGroup · Slider"
          description="Top-up amount: presets plus a $5–$100 slider."
        >
          <ToggleGroup
            value={[String(amount)]}
            onValueChange={(value) => {
              if (value[0]) setAmount(Number(value[0]));
            }}
            variant="outline"
            className="w-full"
          >
            {amounts.map((value) => (
              <ToggleGroupItem
                key={value}
                value={String(value)}
                className="flex-1"
              >
                ${value}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between text-sm">
              <span>Amount</span>
              <span className="font-mono">${amount.toFixed(2)}</span>
            </div>
            <Slider
              value={amount}
              min={5}
              max={100}
              step={1}
              onValueChange={(value) => setAmount(value as number)}
              aria-label="Top-up amount"
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>$5</span>
              <span>$100</span>
            </div>
          </div>
        </Example>

        <Example title="Tooltip · DropdownMenu · Dialog · Sheet">
          <div className="flex flex-wrap items-center gap-2">
            <Tooltip>
              <TooltipTrigger
                render={<Button variant="outline" size="icon" />}
                aria-label="Download project"
              >
                <DownloadIcon />
              </TooltipTrigger>
              <TooltipContent>Download as ZIP</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" />}>
                Project
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuGroup>
                  <DropdownMenuItem>Rename</DropdownMenuItem>
                  <DropdownMenuItem>Duplicate</DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuItem variant="destructive">
                    <Trash2Icon />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Dialog>
              <DialogTrigger render={<Button variant="outline" />}>
                <GithubIcon data-icon="inline-start" />
                Export to GitHub
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Export to GitHub</DialogTitle>
                  <DialogDescription>
                    Creates a new repository and pushes the current version as
                    one commit.
                  </DialogDescription>
                </DialogHeader>
                <Input
                  defaultValue="ember-oak-roasters"
                  aria-label="Repository name"
                  className="font-mono"
                />
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>
                    Cancel
                  </DialogClose>
                  <Button>Create repository</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <Sheet>
              <SheetTrigger render={<Button variant="outline" />}>
                Open sheet
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>Version history</SheetTitle>
                  <SheetDescription>
                    Restore any checkpoint into the sandbox.
                  </SheetDescription>
                </SheetHeader>
              </SheetContent>
            </Sheet>
            <Button
              variant="outline"
              onClick={() =>
                toast.add({
                  title: "Copied to clipboard",
                  description: "app/page.tsx",
                  type: "success",
                })
              }
            >
              Show toast
            </Button>
          </div>
        </Example>

        <Example title="Card · Skeleton">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Card>
              <CardHeader>
                <CardDescription>Balance</CardDescription>
                <CardTitle className="text-page-title">1,198</CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground">
                credits available
              </CardContent>
            </Card>
            <Card aria-label="Loading project" aria-busy>
              <CardHeader>
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </CardContent>
            </Card>
          </div>
        </Example>

        <Example title="Breadcrumb · Avatar · Progress · Spinner">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink href="/">Home</BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Usage &amp; credits</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <div className="flex items-center gap-4">
            <Avatar>
              <AvatarFallback>N</AvatarFallback>
            </Avatar>
            <Progress
              value={60}
              aria-label="Credits remaining"
              className="flex-1"
            />
            <Spinner />
          </div>
        </Example>

        <Example title="Table · Empty" className="lg:col-span-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Credits</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sampleActivity.map((row) => (
                <TableRow key={`${row.date}-${row.description}`}>
                  <TableCell className="text-muted-foreground">
                    {row.date}
                  </TableCell>
                  <TableCell>{row.project ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.description}
                  </TableCell>
                  <TableCell
                    className={cn(
                      "text-right font-mono",
                      row.credits > 0 && "text-success",
                    )}
                  >
                    {numberFormat.format(row.credits)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Separator />
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderIcon />
              </EmptyMedia>
              <EmptyTitle>No projects yet</EmptyTitle>
              <EmptyDescription>
                Describe a website on the home page and Vibe will build it in a
                live sandbox.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button>
                <PlusIcon data-icon="inline-start" />
                New project
              </Button>
            </EmptyContent>
          </Empty>
        </Example>

        <Example title="Resizable · ScrollArea">
          <ResizablePanelGroup
            orientation="horizontal"
            className="min-h-48 rounded-lg border"
          >
            <ResizablePanel defaultSize="35%" minSize="20%">
              <ScrollArea className="h-48">
                <ul className="flex flex-col p-2 text-sm">
                  {sampleProjects.map((project) => (
                    <li
                      key={project.slug}
                      className="truncate rounded-md px-2 py-1.5 text-muted-foreground"
                    >
                      {project.name}
                    </li>
                  ))}
                </ul>
              </ScrollArea>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel>
              <div className="flex h-full items-center justify-center text-caption text-muted-foreground">
                Drag the handle
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </Example>

        <Example title="Command" description="⌘K palette.">
          <Command className="rounded-lg border">
            <CommandInput placeholder="Search projects and actions…" />
            <CommandList>
              <CommandEmpty>No results.</CommandEmpty>
              <CommandGroup heading="Actions">
                <CommandItem>
                  <PlusIcon />
                  New project
                  <CommandShortcut>⌘K</CommandShortcut>
                </CommandItem>
                <CommandItem>
                  <HouseIcon />
                  Home
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </Example>
      </div>
    </DesignSection>
  );
}
