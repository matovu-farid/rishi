import Loader from "@components/Loader";
import { useQuery } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "react-toastify";

import React, { useRef } from "react";
import { getBooks, updateBookLocation } from "@/modules/books";
import { EpubView } from "@components/epub";
import { PdfView } from "@components/pdf";

export const Route = createLazyFileRoute("/books/$id")({
  component: () => <BookView />,
});

function BookView(): React.JSX.Element {
  const { id } = Route.useParams() as { id: string };

  const {
    isPending,
    error,
    data: book,
    isError,
  } = useQuery({
    queryKey: ["book"],
    queryFn: async () => {
      const book = (await getBooks()).find((book) => book.id === id);
      if (!book) {
        throw new Error("Book not found");
      }
      return book;
    },
  });

  const updateBookLocationMutation = useMutation({
    mutationFn: async ({
      bookId,
      location,
    }: {
      bookId: string;
      location: string;
    }) => {
      await updateBookLocation(bookId, location);
    },

    onError(error) {
      toast.error("Can not change book page");
      console.log({ error });
    },
  });

  // Create stable debounced function that uses the latest mutation
  const mutationRef = useRef(updateBookLocationMutation);
  mutationRef.current = updateBookLocationMutation;

  if (isError)
    return (
      <div className="w-full h-full place-items-center grid">
        {" "}
        {error.message}
      </div>
    );
  if (isPending)
    return (
      <div className="w-full h-full place-items-center grid">
        <Loader />
      </div>
    );

  return (
    <div className="">
      {book.kind === "epub" && <EpubView book={book} />}
      {book.kind === "pdf" && <PdfView book={book} />}
    </div>
  );
}
