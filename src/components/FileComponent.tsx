import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Loader from "./Loader";
import { Link } from "@tanstack/react-router";
import { toast } from "react-toastify";
import { IconButton } from "./ui/IconButton";
import { Button } from "./ui/Button";
import { Trash2, Plus } from "lucide-react";
import { chooseFiles } from "@/modules/chooseFiles";
import { BookData, getBookData, getPdfData } from "@/generated";
import {
  getBooks,
  deleteBook,
  copyBookToAppData,
  storeBook,
} from "@/modules/books";
import { useTauriDragDrop } from "./hooks/use-tauri-drag-drop";
import { motion, AnimatePresence } from "framer-motion";

// Add this helper function
function bytesToBlobUrl(bytes: number[]): string {
  const uint8Array = new Uint8Array(bytes);
  const blob = new Blob([uint8Array], { type: "image/jpeg" }); // Change type if needed
  return URL.createObjectURL(blob);
}

// Animation variants for book items
const bookVariants = {
  initial: {
    opacity: 0,
    scale: 0.8,
    y: 20,
  },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
  },
  exit: {
    opacity: 0,
    scale: 0.8,
  },
};

const containerVariants = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

function FileDrop(): React.JSX.Element {
  const queryClient = useQueryClient();
  const {
    isPending,
    error,
    data: books,
    isError,
  } = useQuery({
    queryKey: ["books"],
    queryFn: () => getBooks(),
  });
  const deleteBookMutation = useMutation({
    mutationKey: ["deleteBook"],
    mutationFn: async ({ book }: { book: BookData }) => {
      await deleteBook(book);
    },

    onError(error) {
      toast.error("Can't remove book");
      console.log({ error });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });

  const storeBookDataMutation = useMutation({
    mutationKey: ["getBookData"],
    mutationFn: async ({ filePath }: { filePath: string }) => {
      const epubPath = await copyBookToAppData(filePath);

      const bookData = await getBookData({ epubPath });
      await storeBook(bookData);

      return bookData;
    },

    onError(error) {
      toast.error("Can't upload book");
      console.log({ error });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });

  const storePdfMutation = useMutation({
    mutationKey: ["getPdfData"],
    mutationFn: async ({ filePath }: { filePath: string }) => {
      const pdfPath = await copyBookToAppData(filePath);

      const bookData = await getPdfData({ pdfPath });
      await storeBook(bookData);

      return bookData;
    },

    onError(error) {
      toast.error("Can't upload book");
      console.log({ error });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });

  // Extract file processing logic to be reusable
  const processFilePaths = (filePaths: string[]) => {
    if (filePaths.length > 0) {
      filePaths.forEach((filePath) => {
        if (filePath.endsWith(".epub")) {
          storeBookDataMutation.mutate({ filePath });
        } else if (filePath.endsWith(".pdf")) {
          storePdfMutation.mutate({ filePath });
        }
      });
    }
  };

  // Handle native file picker (recommended approach)
  const handleChooseFiles = async () => {
    try {
      const filePaths: string[] = await chooseFiles();
      console.log({ filePaths });
      processFilePaths(filePaths);
    } catch (error) {
      toast.error("Can't open file picker");
      console.error(error);
    }
  };

  // Handle drag and drop using Tauri native API
  const { isDragging } = useTauriDragDrop({
    allowedExtensions: [".epub", ".pdf"],
    onFilesDropped: (filePaths) => {
      console.log({ filePaths });
      processFilePaths(filePaths);
    },
  });
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
    <div className="w-full h-full">
      {/* Add Book Button - always visible at the top */}
      <div className="p-4 flex justify-end">
        <Button
          variant="ghost"
          startIcon={<Plus size={20} />}
          onClick={handleChooseFiles}
        >
          Add Book
        </Button>
      </div>

      <motion.div
        layout
        variants={containerVariants}
        initial="animate"
        animate="animate"
        style={
          books && books.length > 0
            ? {
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
                gridAutoFlow: "row",
              }
            : {}
        }
        className={
          books && books.length > 0
            ? "w-full h-screen p-5 gap-[30px] place-items-baseline cursor-pointer"
            : "grid place-items-center gap-3 rounded-3xl w-[50vw] h-[50vh] p-5 mx-auto"
        }
      >
        {isDragging && (!books || books.length === 0) ? (
          <p>Drop the files here ...</p>
        ) : books && books.length > 0 ? (
          <AnimatePresence mode="popLayout">
            {books.map((book) => (
              <motion.div
                key={book.id}
                layout
                variants={bookVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{
                  duration: 0.4,
                  ease: "easeOut",
                }}
                className="p-2 grid relative"
              >
                <div
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  className="rounded-3xl bg-transparent"
                >
                  <div className="absolute top-0 right-0">
                    <IconButton
                      onClick={() => {
                        deleteBookMutation.mutate({ book });
                      }}
                      color="error"
                      className="bg-white p-0 z-10 drop-shadow cursor-pointer"
                    >
                      <Trash2 size={20} />
                    </IconButton>
                  </div>

                  <Link
                    to="/books/$id"
                    params={{ id: book.id }}
                    className="rounded-3xl bg-transparent  overflow-hidden"
                  >
                    <img
                      className="object-fill shadow-3xl drop-shadow-lg"
                      src={bytesToBlobUrl(book.cover)}
                      width={200}
                      alt="cover image"
                    />
                  </Link>
                </div>
                <div className="text-teal-500 justify-center p-2 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                  {book.title}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        ) : (
          <div className="text-center">
            <p className="mb-4">No books yet. Add your first book!</p>
            <p className="text-sm text-gray-500">
              You can also drag and drop EPUB or PDF files here
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

export default FileDrop;
