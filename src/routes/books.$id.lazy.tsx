import Loader from "@components/Loader";
import { useQuery } from "@tanstack/react-query";
import { createLazyFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { toast } from "react-toastify";

import React, { useRef } from "react";
import { getBooks, updateBookLocation } from "@/modules/books";
import { EpubView } from "@components/epub";
import { PdfView } from "@components/pdf";
import { motion } from "framer-motion";
import { useSetAtom } from "jotai";
import { currentBookDataAtom } from "@/stores/paragraph-atoms";
export const Route = createLazyFileRoute("/books/$id")({
  component: () => <BookView />,
});

function BookView(): React.JSX.Element {
  const { id } = Route.useParams() as { id: string };
  const setBookData = useSetAtom(currentBookDataAtom);

  const {
    isPending,
    error,
    data: book,
    isError,
  } = useQuery({
    queryKey: ["book", id],
    queryFn: async () => {
      const book = (await getBooks()).find((book) => book.id === id);
      if (!book) {
        throw new Error("Book not found");
      }
      setBookData(book);
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

    onError() {
      toast.error("Can not change book page");
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
      <div className="w-full h-screen place-items-center grid">
        <Loader />
      </div>
    );

  return (
    <motion.div layout className="">
      {book?.kind === "pdf" && <PdfView key={book.id} book={book} />}
      {book?.kind === "epub" && <EpubView book={book} />}
    </motion.div>
  );
}
