import { Project, SyntaxKind, ObjectLiteralExpression, PropertyAssignment, ArrowFunction, Block, Node } from "ts-morph";
import * as fs from "fs";

const project = new Project();
project.addSourceFilesAtPaths("src/**/*.tsx");
project.addSourceFilesAtPaths("src/**/*.ts");

let updatedCount = 0;

for (const sourceFile of project.getSourceFiles()) {
    let fileModified = false;
    let keepGoing = true;
    while(keepGoing) {
        keepGoing = false;
        const calls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
        for (const call of calls) {
            if (call.getExpression().getText() === "useMutation") {
                const args = call.getArguments();
                if (args.length > 0 && Node.isObjectLiteralExpression(args[0])) {
                    const configObj = args[0] as ObjectLiteralExpression;
                    
                    let message = "Action completed successfully";
                    const parentVar = call.getFirstAncestorByKind(SyntaxKind.VariableDeclaration);
                    if (parentVar) {
                        const varName = parentVar.getName();
                        if (varName.includes("save") || varName.includes("update") || varName.includes("edit") || varName.includes("toggle")) message = "Saved successfully";
                        else if (varName.includes("delete") || varName.includes("remove") || varName.includes("vacate")) message = "Deleted successfully";
                        else if (varName.includes("create") || varName.includes("add")) message = "Created successfully";
                        else if (varName.includes("approve")) message = "Approved successfully";
                        else if (varName.includes("reject")) message = "Rejected successfully";
                        else if (varName.includes("apply")) message = "Applied successfully";
                        else if (varName.includes("send")) message = "Sent successfully";
                        else if (varName.includes("upload")) message = "Uploaded successfully";
                        else if (varName.includes("status") || varName.includes("reindex") || varName.includes("resume") || varName.includes("needsChanges")) message = "Status updated successfully";
                        else if (varName.includes("generate")) message = "Generated successfully";
                        else if (varName.includes("submit")) message = "Submitted successfully";
                        else if (varName.includes("export")) message = "Exported successfully";
                        else if (varName.includes("assign")) message = "Assigned successfully";
                        else if (varName.includes("deactivate")) message = "Deactivated successfully";
                    }

                    const onSuccessProp = configObj.getProperty("onSuccess");
                    if (onSuccessProp && Node.isPropertyAssignment(onSuccessProp)) {
                        const initializer = onSuccessProp.getInitializer();
                        if (initializer && (Node.isArrowFunction(initializer) || Node.isFunctionExpression(initializer))) {
                            const body = initializer.getBody();
                            if (Node.isBlock(body)) {
                                if (!body.getText().includes("toast.success")) {
                                    body.insertStatements(0, `toast.success("${message}");`);
                                    fileModified = true;
                                    keepGoing = true;
                                    break;
                                }
                            } else {
                                const text = body.getText();
                                if (!text.includes("toast.success")) {
                                    if (Node.isArrowFunction(initializer)) {
                                        const params = initializer.getParameters().map(p => p.getText()).join(", ");
                                        initializer.replaceWithText(`(${params}) => {\n  toast.success("${message}");\n  return ${text};\n}`);
                                    } else {
                                        initializer.replaceWithText(`function() {\n  toast.success("${message}");\n  return ${text};\n}`);
                                    }
                                    fileModified = true;
                                    keepGoing = true;
                                    break;
                                }
                            }
                        }
                    } else {
                        configObj.addPropertyAssignment({
                            name: "onSuccess",
                            initializer: `() => { toast.success("${message}"); }`
                        });
                        fileModified = true;
                        keepGoing = true;
                        break;
                    }
                }
            }
        }
    }

    if (fileModified) {
        // Check for import
        const imports = sourceFile.getImportDeclarations();
        const hasToastImport = imports.some(imp => imp.getModuleSpecifierValue() === "react-hot-toast" && imp.getDefaultImport()?.getText() === "toast");
        
        if (!hasToastImport) {
            sourceFile.addImportDeclaration({
                defaultImport: "toast",
                moduleSpecifier: "react-hot-toast"
            });
        }
        
        sourceFile.saveSync();
        updatedCount++;
        console.log(`Updated ${sourceFile.getFilePath()}`);
    }
}

console.log(`Total files updated: ${updatedCount}`);
