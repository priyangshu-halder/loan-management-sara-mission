import React from "react";
import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions/auth-guard";
import { getCustomerById, getGroups } from "@/modules/customers/customer-service";
import { EditCustomerClient } from "./EditCustomerClient";

interface Props {
  params: { id: string } | Promise<{ id: string }>;
}

export default async function EditCustomerPage({ params }: Props) {
  const user = await getCurrentUser();
  if (!user) return null;

  const { id } = await Promise.resolve(params);

  let customer;
  try {
    customer = await getCustomerById(user, id);
  } catch {
    notFound();
  }

  const groups = await getGroups(user).catch(() => []);

  const serializedCustomer = JSON.parse(JSON.stringify(customer));
  const serializedGroups = JSON.parse(
    JSON.stringify(
      groups.map((g) => ({
        id: g.id,
        code: g.code,
        name: g.name,
      }))
    )
  );

  return (
    <EditCustomerClient
      initialCustomer={serializedCustomer}
      groups={serializedGroups}
    />
  );
}
