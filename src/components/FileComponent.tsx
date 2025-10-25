import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useDropzone } from "react-dropzone";
import Loader from "./Loader";
import { Link } from "@tanstack/react-router";
import { Book } from "@//types";
import { toast } from "react-toastify";
import { IconButton } from "./ui/IconButton";
import { Button } from "./ui/Button";
import { Trash2, Plus } from "lucide-react";
import { deleteBook, getBooks } from "@/modules/epub";
import { getCoverImage } from "@/modules/getCoverImage";
import { chooseFiles } from "@/modules/chooseFiles";

// Type augmentation for Electron's File.path property
interface ElectronFile extends File {
  path: string; // Electron-only augmentation
}

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
    mutationFn: async ({ book }: { book: Book }) => {
      await deleteBook(book.internalFolderName);
    },

    onError(error) {
      toast.error("Can't remove book");
      console.log({ error });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });
  const getCoverImageMutation = useMutation({
    mutationKey: ["getCoverImage"],
    mutationFn: async ({ filePath }: { filePath: string }) => {
      const coverImage = await getCoverImage(filePath);
      if (coverImage === null) {
        throw new Error("Failed to get cover image");
      }
      return coverImage;
    },

    onError(error) {
      toast.error("Can't upload book");
      console.log({ error });
    },
    onSuccess() {
      void queryClient.invalidateQueries({ queryKey: ["books"] });
    },
  });

  // Handle native file picker (recommended approach)
  const handleChooseFiles = async () => {
    try {
      const filePaths: string[] = await chooseFiles();
      console.log({ filePaths });
      if (filePaths.length > 0) {
        filePaths.forEach((filePath) => {
          getCoverImageMutation.mutate({ filePath });
        });
      }
    } catch (error) {
      toast.error("Can't open file picker");
      console.error(error);
    }
  };

  // Handle drag and drop (uses Electron's File.path property)
  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      acceptedFiles.forEach((file) => {
        console.log({ file });
        // In Electron, File objects have a .path property with the real path
        const electronFile = file as ElectronFile;
        if (electronFile.path) {
          getCoverImageMutation.mutate({ filePath: electronFile.path });
        } else {
          toast.error(
            "Could not get file path. Please use the file picker button."
          );
        }
      });
    },
    [getCoverImageMutation]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });
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

      <div
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
        {...getRootProps()}
      >
        <input {...getInputProps()} className="p-5 cursor-pointer" />
        {books
          .flatMap((book) => book.assets)
          .flatMap((asset) => asset.css)
          .filter((cssObj) => cssObj !== undefined)
          .map(
            (cssObj) =>
              cssObj && (
                <link key={cssObj.id} rel="stylesheet" href={cssObj.href} />
              )
          )}
        {isDragActive && (!books || books.length === 0) ? (
          <p>Drop the files here ...</p>
        ) : books && books.length > 0 ? (
          books.map((book, idx) => (
            <div key={idx + book.cover} className="p-2 grid relative">
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
                    className="bg-white p-1"
                  >
                    <Trash2 size={20} />
                  </IconButton>
                </div>

                <Link
                  to="/books/$id"
                  params={{ id: book.id }}
                  className="rounded-3xl bg-transparent shadow-2xl overflow-hidden"
                >
                  <img
                    className="object-fill"
                    src={book.cover}
                    width={200}
                    alt="cover image"
                  />
                </Link>
              </div>
              <div className="text-teal-500 justify-center p-2 overflow-hidden text-ellipsis whitespace-nowrap text-sm">
                {book.title}
              </div>
            </div>
          ))
        ) : (
          <div className="text-center">
            <p className="mb-4">No books yet. Add your first book!</p>
            <p className="text-sm text-gray-500">
              You can also drag and drop EPUB files here
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default FileDrop;
