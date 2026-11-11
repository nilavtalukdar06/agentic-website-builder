import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArticleBody, ArticleLayout } from "@/components/marketing/prose";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  docArticles,
  getAdjacentArticles,
  getDocArticle,
} from "../_content/articles";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return docArticles.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Params;
}): Promise<Metadata> {
  const article = getDocArticle((await params).slug);
  if (!article) return {};
  return {
    title: `${article.title} · Docs`,
    description: article.description,
    alternates: { canonical: `/docs/${article.slug}` },
  };
}

export default async function DocArticlePage({ params }: { params: Params }) {
  const { slug } = await params;
  const article = getDocArticle(slug);
  if (!article) notFound();
  const { previous, next } = getAdjacentArticles(slug);

  return (
    <ArticleLayout
      title={article.title}
      description={article.description}
      sections={article.sections}
      meta={
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink render={<Link href="/docs" />}>
                Docs
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{article.title}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
      }
    >
      <ArticleBody sections={article.sections} />
      <nav
        aria-label="More docs"
        className="flex items-center justify-between gap-4 border-t pt-6 text-sm"
      >
        {previous ? (
          <Link
            href={`/docs/${previous.slug}`}
            className="flex items-center gap-2 rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <ArrowLeftIcon className="size-4" />
            {previous.title}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            href={`/docs/${next.slug}`}
            className="flex items-center gap-2 rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {next.title}
            <ArrowRightIcon className="size-4" />
          </Link>
        ) : (
          <span />
        )}
      </nav>
    </ArticleLayout>
  );
}
