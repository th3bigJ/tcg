import { redirect } from "next/navigation";

type ShopProductDetailPageProps = {
  params: Promise<{
    productId: string;
  }>;
};

export default async function ShopProductDetailPage({ params }: ShopProductDetailPageProps) {
  const { productId: rawProductId } = await params;
  redirect(`/sealed/${encodeURIComponent(rawProductId)}`);
}
